import { and, desc, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, metrics, publications } from "@/db/schema";
import { spec } from "@/platforms/registry";
import type { MetricDetails } from "@/platforms/types";
import { parseManualNumbers, type ManualKey } from "@/lib/metric-input";

/** Posted items with their latest numbers. Shared by the Published page and the API. */
export async function listPublications(userId: string, limit = 50) {
  return asUser(userId, async (tx) => {
    const rows = await tx.select({ id: publications.id, platform: publications.platform, draftId: publications.draftId, status: publications.status, externalId: publications.externalPostId, publishedAt: publications.publishedAt, createdAt: publications.createdAt, body: drafts.body })
      .from(publications).innerJoin(drafts, eq(drafts.id, publications.draftId)).orderBy(desc(publications.createdAt)).limit(limit);
    const latest = await tx.selectDistinctOn([metrics.publicationId]).from(metrics).orderBy(metrics.publicationId, desc(metrics.capturedAt));
    return rows.map((r) => {
      const m = latest.find((x) => x.publicationId === r.id);
      const real = r.externalId && !r.externalId.includes(":demo-");
      return {
        id: r.id, platform: r.platform, draftId: r.draftId, status: r.status, body: r.body,
        url: real ? spec(r.platform).postUrl?.(r.externalId!) ?? null : null,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        createdAt: r.createdAt,
        externalId: r.externalId,
        latest: m ? latestOf(m) : null,
      };
    });
  });
}

type Pd = { sample?: boolean; source?: "platform" | "manual"; details?: MetricDetails };
function latestOf(m: typeof metrics.$inferSelect) {
  const pd = m.platformData as Pd;
  return {
    impressions: m.impressions, reactions: m.reactions, comments: m.comments, reshares: m.reshares, sample: Boolean(pd.sample),
    // Where the numbers came from (the platform's API or typed in from its analytics), when, and the extras.
    source: pd.source ?? "platform", capturedAt: m.capturedAt.toISOString(), details: pd.details ?? {},
  };
}

/** Save numbers a person copied from the platform's own analytics. Each save is a new snapshot, so the
 *  latest wins and earlier ones stay as history. Only for this user's published posts. */
export async function recordMetrics(userId: string, publicationId: string, raw: Partial<Record<ManualKey, string | number | null>>) {
  const parsed = parseManualNumbers(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  const { details, ...numbers } = parsed.value;
  return asUser(userId, async (tx) => {
    const [pub] = await tx.select({ platform: publications.platform }).from(publications)
      .where(and(eq(publications.id, publicationId), eq(publications.status, "published")));
    if (!pub) throw new Error("That post isn't published, so it has no numbers to record.");
    const [row] = await tx.insert(metrics).values({ userId, publicationId, platform: pub.platform, ...numbers, platformData: { source: "manual", details } }).returning({ id: metrics.id });
    return row;
  });
}
