import { desc, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, metrics, publications } from "@/db/schema";

/** Posted items with their latest numbers. Shared by the Published page and the API. */
export async function listPublications(userId: string, limit = 50) {
  return asUser(userId, async (tx) => {
    const rows = await tx.select({ id: publications.id, draftId: publications.draftId, status: publications.status, externalId: publications.externalPostId, publishedAt: publications.publishedAt, createdAt: publications.createdAt, body: drafts.body })
      .from(publications).innerJoin(drafts, eq(drafts.id, publications.draftId)).orderBy(desc(publications.createdAt)).limit(limit);
    const latest = await tx.selectDistinctOn([metrics.publicationId]).from(metrics).orderBy(metrics.publicationId, desc(metrics.capturedAt));
    return rows.map((r) => {
      const m = latest.find((x) => x.publicationId === r.id);
      const real = r.externalId && !r.externalId.includes(":demo-");
      return {
        id: r.id, draftId: r.draftId, status: r.status, body: r.body,
        url: real ? `https://www.linkedin.com/feed/update/${r.externalId}/` : null,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        createdAt: r.createdAt,
        externalId: r.externalId,
        latest: m ? { impressions: m.impressions, reactions: m.reactions, comments: m.comments, reshares: m.reshares, sample: Boolean((m.platformData as { sample?: boolean }).sample) } : null,
      };
    });
  });
}
