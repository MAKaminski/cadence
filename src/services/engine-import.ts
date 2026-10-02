// LinkedIn Engine history → Cadence. The engine (MAKaminski/linkedin-engine-dev) kept every post it
// published with its pillar, hook, visual and rubric score, and captured each post's numbers several times.
// scripts/engine-export.mjs writes that as one JSON file; this turns it into Cadence's own records: a
// published draft (its gate carries the pillar as the angle, plus hook, visual and score), a publication with
// the post's LinkedIn id, and one metrics snapshot per capture. Importing the same file twice adds nothing.
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { asUser } from "@/db";
import { drafts, metrics, publications } from "@/db/schema";
import { track } from "@/lib/usage";

const count = z.number().int().min(0).nullable();
const text = (n: number) => z.string().max(n).nullable().default(null);
export const EnginePost = z.object({
  url: z.string().max(500),
  postedAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "postedAt must be a date"),
  body: text(10_000), pillar: text(60), hook: text(60), visual: text(60), topic: text(2000),
  score: z.number().nullable().default(null),
  snapshots: z.array(z.object({ at: z.string().nullable(), impressions: count, reactions: count, comments: count, reposts: count })).max(200).default([]),
});
export type EnginePost = z.infer<typeof EnginePost>;
export const EngineFile = z.object({ version: z.literal(1), source: z.literal("linkedin-engine"), exportedAt: z.string().optional(), posts: z.array(z.unknown()).max(20_000) });

/** The post's LinkedIn id ("urn:li:activity:…"), which Cadence keys publications by. */
export function postUrn(url: string): string | null {
  return url.match(/urn:li:(?:activity|share|ugcPost):\d+/)?.[0] ?? null;
}

/** "field-note" → "Field note": the pillar becomes the draft's angle, so Results groups by it. */
export const pillarLabel = (p: string | null) => (p ? p.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null);

export type EngineImportResult = { added: number; existing: number; snapshots: number; skipped: number };

/** Import one batch of posts for this user. Idempotent: posts already here only gain new snapshots. */
export async function importEnginePosts(userId: string, raw: unknown[]): Promise<EngineImportResult> {
  const res: EngineImportResult = { added: 0, existing: 0, snapshots: 0, skipped: 0 };
  const posts: (EnginePost & { urn: string })[] = [];
  for (const r of raw) {
    const p = EnginePost.safeParse(r);
    const urn = p.success ? postUrn(p.data.url) : null;
    if (!p.success || !urn) { res.skipped++; continue; }
    posts.push({ ...p.data, urn });
  }
  if (!posts.length) return res;
  await asUser(userId, async (tx) => {
    const have = await tx.select({ id: publications.id, urn: publications.externalPostId }).from(publications)
      .where(and(eq(publications.platform, "linkedin"), inArray(publications.externalPostId, posts.map((p) => p.urn))));
    const pubIds = new Map(have.map((h) => [h.urn!, h.id]));
    const seen = new Set((have.length ? await tx.select({ pid: metrics.publicationId, at: metrics.capturedAt }).from(metrics)
      .where(inArray(metrics.publicationId, have.map((h) => h.id))) : []).map((m) => `${m.pid}|${m.at.toISOString()}`));
    for (const p of posts) {
      const at = new Date(p.postedAt);
      let pid = pubIds.get(p.urn);
      if (pid) res.existing++;
      else {
        const [d] = await tx.insert(drafts).values({
          userId, platform: "linkedin", body: p.body ?? "", status: "published", createdAt: at,
          gate: { angle: pillarLabel(p.pillar), hook: p.hook, visual: p.visual, rubricScore: p.score, topic: p.topic, source: "linkedin-engine" },
        }).returning({ id: drafts.id });
        const [pub] = await tx.insert(publications).values({ userId, draftId: d.id, platform: "linkedin", status: "published", externalPostId: p.urn, publishedAt: at, createdAt: at })
          .onConflictDoNothing().returning({ id: publications.id });
        if (!pub) { res.skipped++; continue; } // the same LinkedIn post belongs to another Cadence account
        pid = pub.id;
        res.added++;
      }
      for (const s of p.snapshots) {
        const capturedAt = new Date(s.at ?? p.postedAt);
        if (!Number.isFinite(capturedAt.getTime()) || seen.has(`${pid}|${capturedAt.toISOString()}`)) continue;
        await tx.insert(metrics).values({
          userId, publicationId: pid, platform: "linkedin", capturedAt,
          impressions: s.impressions, reactions: s.reactions, comments: s.comments, reshares: s.reposts,
          platformData: { source: "import", from: "linkedin-engine" },
        });
        seen.add(`${pid}|${capturedAt.toISOString()}`);
        res.snapshots++;
      }
    }
  });
  await track(userId, { feature: "import", action: "engine posts", meta: { ...res } });
  return res;
}
