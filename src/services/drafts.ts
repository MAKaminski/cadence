// Check-ins and drafts: the weekly loop. The web app's server actions, the public API and the MCP
// server all call these, so there is one set of rules for approving, editing and skipping.
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, inputs, jobs, profiles } from "@/db/schema";
import { enqueue } from "@/lib/jobs";
import { approveInTx } from "@/lib/drafting";
import { evaluate } from "@/engine/evaluate";
import { LIMITS } from "@/lib/catalog";
import type { GateRecord } from "@/engine/types";
import { isPaused } from "./plan";
import { ServiceError } from "./errors";

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
export const CHECKINS_PER_DAY = 20;
export const DRAFT_STATUSES = ["draft", "held", "scheduled", "published", "skipped", "failed"] as const;

export type DraftOut = {
  id: string; status: (typeof DRAFT_STATUSES)[number]; version: number; body: string;
  scheduledFor: string | null; createdAt: string; why: GateRecord;
};
const out = (d: typeof drafts.$inferSelect): DraftOut => ({
  id: d.id, status: d.status as DraftOut["status"], version: d.version, body: d.body,
  scheduledFor: d.scheduledFor?.toISOString() ?? null, createdAt: d.createdAt.toISOString(), why: d.gate as GateRecord,
});

export async function saveCheckin(userId: string, body: string): Promise<{ id: string }> {
  const text = body.trim();
  if (text.length < 20) throw new ServiceError("invalid", "Give it a few sentences to work with.");
  if (text.length > 4000) throw new ServiceError("invalid", "Keep a check-in under 4,000 characters.");
  return asUser(userId, async (tx) => {
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(inputs).where(gte(inputs.createdAt, new Date(Date.now() - 86_400_000)));
    if (n.n >= CHECKINS_PER_DAY) throw new ServiceError("limit", `That's ${CHECKINS_PER_DAY} check-ins in a day; try again tomorrow.`);
    const [row] = await tx.insert(inputs).values({ userId, kind: "checkin", body: text }).returning({ id: inputs.id });
    await enqueue(tx, userId, "draft", row.id);
    return row;
  });
}

export async function listDrafts(userId: string, status?: DraftOut["status"][], limit = 50): Promise<DraftOut[]> {
  const rows = await asUser(userId, (tx) => tx.select().from(drafts)
    .where(status?.length ? inArray(drafts.status, status) : undefined).orderBy(desc(drafts.createdAt)).limit(Math.min(limit, 100)));
  return rows.map(out);
}

export async function getDraft(userId: string, id: string): Promise<DraftOut> {
  const [d] = await asUser(userId, (tx) => tx.select().from(drafts).where(eq(drafts.id, id)));
  if (!d) throw new ServiceError("not_found", "No draft with that id.");
  return out(d);
}

/** Is a draft job still running for this user? (The "drafting…" state.) */
export async function isDrafting(userId: string) {
  const r = await asUser(userId, (tx) => tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.kind, "draft"), inArray(jobs.status, ["queued", "running"]))).limit(1));
  return r.length > 0;
}

export async function approveDraft(userId: string, id: string): Promise<DraftOut> {
  await asUser(userId, (tx) => approveInTx(tx, userId, id)).catch((e) => { throw e instanceof ServiceError ? e : new ServiceError("conflict", (e as Error).message); });
  return getDraft(userId, id);
}

async function unschedule(tx: Tx, id: string) {
  await tx.delete(jobs).where(and(eq(jobs.refId, id), eq(jobs.kind, "publish"), eq(jobs.status, "queued")));
}

/** Your edit is re-checked but never rewritten: you are the author. It needs approving again. */
export async function editDraft(userId: string, id: string, body: string): Promise<DraftOut> {
  const text = body.trim();
  if (text.length < 10) throw new ServiceError("invalid", "The post is too short.");
  if (text.length > LIMITS.hardChars) throw new ServiceError("invalid", `LinkedIn allows ${LIMITS.hardChars} characters.`);
  await asUser(userId, async (tx) => {
    const [d] = await tx.select().from(drafts).where(eq(drafts.id, id));
    if (!d) throw new ServiceError("not_found", "No draft with that id.");
    if (!["draft", "held", "scheduled"].includes(d.status)) throw new ServiceError("conflict", "This draft can no longer be edited.");
    const [p] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
    const ids = (d.inputIds as string[]).filter(Boolean);
    const notes = ids.length ? (await tx.select({ body: inputs.body }).from(inputs).where(inArray(inputs.id, ids))).map((r) => r.body) : [];
    const recent = (await tx.select({ body: drafts.body }).from(drafts)
      .where(and(inArray(drafts.status, ["scheduled", "published"]), sql`${drafts.id} <> ${id}`)).limit(LIMITS.repeatLookback)).map((r) => r.body);
    const ev = evaluate(text, { facts: p.facts as string[], notes, topics: p.topics as string[], noGo: p.noGo as string[], recent });
    const gate = d.gate as GateRecord;
    await unschedule(tx, id);
    await tx.update(drafts).set({
      body: ev.text, version: d.version + 1, approvedBodyHash: null, scheduledFor: null,
      status: ev.verdict === "held" ? "held" : "draft",
      gate: { ...gate, checks: ev.checks, verdict: ev.verdict === "held" ? "held" : "ok", adjustments: [...gate.adjustments, `Edited by you (version ${d.version + 1})`, ...ev.fixes] },
    }).where(eq(drafts.id, id));
  });
  return getDraft(userId, id);
}

export async function skipDraft(userId: string, id: string): Promise<DraftOut> {
  const r = await asUser(userId, async (tx) => {
    await unschedule(tx, id);
    return tx.update(drafts).set({ status: "skipped", scheduledFor: null })
      .where(and(eq(drafts.id, id), inArray(drafts.status, ["draft", "held", "scheduled"]))).returning({ id: drafts.id });
  });
  if (!r.length) throw new ServiceError("conflict", "Only drafts that haven't posted can be skipped.");
  return getDraft(userId, id);
}

/** Web app only: move an approved post's slot to now. Deliberately not in the API or MCP server. */
export async function postNow(userId: string, id: string) {
  const now = new Date();
  const n = await asUser(userId, async (tx) => {
    if (await isPaused(tx)) throw new ServiceError("conflict", "Posting is paused. Resume it on Plan first.");
    const r = await tx.update(jobs).set({ runAt: now }).where(and(eq(jobs.refId, id), eq(jobs.kind, "publish"), eq(jobs.status, "queued"))).returning({ id: jobs.id });
    if (r.length) await tx.update(drafts).set({ scheduledFor: now }).where(eq(drafts.id, id));
    return r.length;
  });
  if (!n) throw new ServiceError("conflict", "Approve the draft first.");
}

export async function setAutoPublish(userId: string, on: boolean) {
  await asUser(userId, async (tx) => {
    if (on) {
      const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(drafts)
        .where(and(inArray(drafts.status, ["scheduled", "published"]), sql`${drafts.gate}->>'verdict' = 'ok'`));
      const left = LIMITS.autoPublishAfter - c.n;
      if (left > 0) throw new ServiceError("forbidden", `Approve ${left} more clean draft${left > 1 ? "s" : ""} first.`);
    }
    await tx.update(profiles).set({ autoPublish: on }).where(eq(profiles.userId, userId));
  });
}
