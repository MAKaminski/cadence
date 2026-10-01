// Publishing a scheduled draft, exactly once. Four separate steps, each committed on its own:
//   1. check the draft is still scheduled and its text is exactly what was approved
//   2. write publications(status='publishing') — the unique key per draft means a second attempt stops here
//   3. call the platform, outside any transaction
//   4. mark it published
// A crash between 2 and 4 leaves 'publishing', which recoverLost() turns into 'needs_review'.
import { and, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, platformAccounts, publications } from "@/db/schema";
import { bodyHash } from "@/lib/drafting";
import { FAULT } from "@/lib/mode";
import { adapterFor, PublishError } from "@/platforms";
import { spec } from "@/platforms/registry";
import { enqueue } from "@/lib/jobs";
import { push } from "@/lib/push";
import { isDemo } from "@/lib/mode";
import { metrics as metricsTable } from "@/db/schema";
import { isPaused } from "@/services/plan";

/** While posting is paused, a due post waits and is checked again this often. */
const PAUSE_RECHECK_MS = 30 * 60_000;

export async function publishDraft(userId: string, draftId: string): Promise<string> {
  const d = await asUser(userId, async (tx) => (await tx.select().from(drafts).where(eq(drafts.id, draftId)))[0]);
  if (!d || d.status !== "scheduled") return "Not posted: the draft is no longer scheduled.";
  // Paused on Plan: the post keeps its place and is looked at again later; nothing is used up.
  const later = await asUser(userId, async (tx) => {
    if (!(await isPaused(tx))) return null;
    const at = new Date(Date.now() + PAUSE_RECHECK_MS);
    await enqueue(tx, userId, "publish", draftId, at);
    return at;
  });
  if (later) return `Not posted yet: posting is paused. Checking again at ${later.toISOString()}.`;
  if (!d.approvedBodyHash || bodyHash(d.body) !== d.approvedBodyHash) return "Not posted: the text changed after approval.";

  const claimed = await asUser(userId, (tx) => tx.insert(publications)
    .values({ userId, draftId, platform: d.platform, status: "publishing" })
    .onConflictDoNothing().returning({ id: publications.id }));
  if (!claimed.length) return "Not posted: this draft already has a publication.";
  const pubId = claimed[0].id;

  const acc = await asUser(userId, async (tx) => (await tx.select().from(platformAccounts)
    .where(and(eq(platformAccounts.platform, d.platform), eq(platformAccounts.status, "active"))).limit(1))[0]);

  try {
    if (!acc) throw new PublishError(`No active ${spec(d.platform).name} connection. Connect it on Channels.`, true);
    const out = await adapterFor(d.platform, acc).publish({ userId, accountId: acc.externalId, text: d.body });
    if (FAULT() === "after_publish") process.exit(86); // publish-safety test: die after the platform said yes
    await asUser(userId, async (tx) => {
      await tx.update(publications).set({ status: "published", externalPostId: out.externalId, publishedAt: new Date() }).where(eq(publications.id, pubId));
      await tx.update(drafts).set({ status: "published" }).where(eq(drafts.id, draftId));
      // Results at 24 h and 72 h (seconds apart in demo mode, so the charts fill in straight away).
      const later = (h: number) => new Date(Date.now() + (isDemo() ? h * 250 : h * 3_600_000));
      for (const h of [24, 72]) await enqueue(tx, userId, "metrics", pubId, later(h));
    });
    await push(userId, { kind: "posted", excerpt: d.body.split("\n")[0] }).catch((e) => console.error("[push]", e));
    return `Published ${out.externalId}`;
  } catch (e) {
    const definite = e instanceof PublishError && e.definite;
    await asUser(userId, async (tx) => {
      await tx.update(publications).set({ status: definite ? "failed" : "needs_review" }).where(eq(publications.id, pubId));
      if (definite) await tx.update(drafts).set({ status: "failed" }).where(eq(drafts.id, draftId));
    });
    throw e;
  }
}

/** Capture one snapshot of a publication's numbers. */
export async function captureMetrics(userId: string, publicationId: string): Promise<string> {
  const pub = await asUser(userId, async (tx) => (await tx.select().from(publications).where(eq(publications.id, publicationId)))[0]);
  if (!pub || pub.status !== "published" || !pub.externalPostId || !pub.publishedAt) return "skipped: not published";
  // Posts recorded by the demo/reviewer publisher get sample numbers from it, never a real platform call.
  const recorded = pub.externalPostId.includes(":demo-") ? { platformData: { reviewer: true } } : null;
  const m = await adapterFor(pub.platform, recorded).fetchMetrics({ userId, externalId: pub.externalPostId, publishedAt: pub.publishedAt });
  if (!m) return "skipped: analytics not available";
  const { sample, ...numbers } = m;
  await asUser(userId, (tx) => tx.insert(metricsTable).values({ userId, publicationId, platform: pub.platform, ...numbers, platformData: sample ? { sample: true } : {} }));
  return `captured ${m.impressions} impressions`;
}
