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

export async function publishDraft(userId: string, draftId: string): Promise<string> {
  const d = await asUser(userId, async (tx) => (await tx.select().from(drafts).where(eq(drafts.id, draftId)))[0]);
  if (!d || d.status !== "scheduled") return "Not posted: the draft is no longer scheduled.";
  if (!d.approvedBodyHash || bodyHash(d.body) !== d.approvedBodyHash) return "Not posted: the text changed after approval.";

  const claimed = await asUser(userId, (tx) => tx.insert(publications)
    .values({ userId, draftId, platform: d.platform, status: "publishing" })
    .onConflictDoNothing().returning({ id: publications.id }));
  if (!claimed.length) return "Not posted: this draft already has a publication.";
  const pubId = claimed[0].id;

  const acc = await asUser(userId, async (tx) => (await tx.select().from(platformAccounts)
    .where(and(eq(platformAccounts.platform, d.platform), eq(platformAccounts.status, "active"))).limit(1))[0]);

  try {
    if (!acc) throw new PublishError("No active LinkedIn connection. Sign in with LinkedIn again.", true);
    const out = await adapterFor(d.platform).publish({ userId, authorUrn: acc.externalId, text: d.body });
    if (FAULT() === "after_publish") process.exit(86); // publish-safety test: die after the platform said yes
    await asUser(userId, async (tx) => {
      await tx.update(publications).set({ status: "published", externalPostId: out.externalId, publishedAt: new Date() }).where(eq(publications.id, pubId));
      await tx.update(drafts).set({ status: "published" }).where(eq(drafts.id, draftId));
    });
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
