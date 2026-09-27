"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, inputs, jobs, profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { enqueue } from "@/lib/jobs";
import { approveInTx } from "@/lib/drafting";
import { evaluate } from "@/engine/evaluate";
import { LIMITS } from "@/lib/catalog";
import type { GateRecord } from "@/engine/types";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const checkin = z.object({ body: z.string().trim().min(20, "Give it a few sentences to work with.").max(4000) });
const id = z.string().uuid();

const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });
const done = (message?: string): Result => { revalidatePath("/app"); revalidatePath("/app/published"); return { ok: true, message }; };

export async function saveCheckin(input: { body: string }): Promise<Result> {
  const user = await requireSubscriber();
  const p = checkin.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await asUser(user.id, async (tx) => {
    const [row] = await tx.insert(inputs).values({ userId: user.id, kind: "checkin", body: p.data.body }).returning({ id: inputs.id });
    await enqueue(tx, user.id, "draft", row.id);
  });
  return done();
}

export async function approveDraft(draftId: string): Promise<Result> {
  const user = await requireSubscriber();
  if (!id.safeParse(draftId).success) return { ok: false, error: "Unknown draft." };
  try {
    const slot = await asUser(user.id, (tx) => approveInTx(tx, user.id, draftId));
    return done(slot.toISOString());
  } catch (e) { return fail(e); }
}

/** Unschedule and drop the queued publish job, if any. Shared by edit and skip. */
async function unschedule(tx: Parameters<Parameters<typeof asUser>[1]>[0], draftId: string) {
  await tx.delete(jobs).where(and(eq(jobs.refId, draftId), eq(jobs.kind, "publish"), eq(jobs.status, "queued")));
}

export async function editDraft(draftId: string, body: string): Promise<Result> {
  const user = await requireSubscriber();
  const b = z.string().trim().min(10, "The post is too short.").max(LIMITS.hardChars, `LinkedIn allows ${LIMITS.hardChars} characters.`).safeParse(body);
  if (!id.safeParse(draftId).success || !b.success) return { ok: false, error: b.success ? "Unknown draft." : b.error.issues[0].message };
  try {
    await asUser(user.id, async (tx) => {
      const [d] = await tx.select().from(drafts).where(eq(drafts.id, draftId));
      if (!d || !["draft", "held", "scheduled"].includes(d.status)) throw new Error("This draft can no longer be edited.");
      const [p] = await tx.select().from(profiles).where(eq(profiles.userId, user.id));
      const [inp] = await tx.select({ body: inputs.body }).from(inputs).where(inArray(inputs.id, (d.inputIds as string[]).length ? d.inputIds as string[] : ["00000000-0000-0000-0000-000000000000"]));
      const recent = (await tx.select({ body: drafts.body }).from(drafts).where(and(inArray(drafts.status, ["scheduled", "published"]), sql`${drafts.id} <> ${draftId}`)).limit(LIMITS.repeatLookback)).map((r) => r.body);
      // Your edit is re-checked but never rewritten: you are the author.
      const ev = evaluate(b.data, { facts: p.facts as string[], notes: inp ? [inp.body] : [], topics: p.topics as string[], noGo: p.noGo as string[], recent });
      const gate = d.gate as GateRecord;
      await unschedule(tx, draftId);
      await tx.update(drafts).set({
        body: ev.text, version: d.version + 1, approvedBodyHash: null, scheduledFor: null,
        status: ev.verdict === "held" ? "held" : "draft",
        gate: { ...gate, checks: ev.checks, verdict: ev.verdict === "held" ? "held" : "ok", adjustments: [...gate.adjustments, `Edited by you (version ${d.version + 1})`, ...ev.fixes] },
      }).where(eq(drafts.id, draftId));
    });
    return done();
  } catch (e) { return fail(e); }
}

export async function skipDraft(draftId: string): Promise<Result> {
  const user = await requireSubscriber();
  if (!id.safeParse(draftId).success) return { ok: false, error: "Unknown draft." };
  await asUser(user.id, async (tx) => {
    await unschedule(tx, draftId);
    await tx.update(drafts).set({ status: "skipped", scheduledFor: null }).where(and(eq(drafts.id, draftId), inArray(drafts.status, ["draft", "held", "scheduled"])));
  });
  return done();
}

/** Move an approved post's slot to now. The worker picks it up within seconds. */
export async function postNow(draftId: string): Promise<Result> {
  const user = await requireSubscriber();
  if (!id.safeParse(draftId).success) return { ok: false, error: "Unknown draft." };
  const now = new Date();
  const n = await asUser(user.id, async (tx) => {
    const r = await tx.update(jobs).set({ runAt: now }).where(and(eq(jobs.refId, draftId), eq(jobs.kind, "publish"), eq(jobs.status, "queued"))).returning({ id: jobs.id });
    if (r.length) await tx.update(drafts).set({ scheduledFor: now }).where(eq(drafts.id, draftId));
    return r.length;
  });
  return n ? done() : { ok: false, error: "Approve the draft first." };
}

export async function setAutoPublish(on: boolean): Promise<Result> {
  const user = await requireSubscriber();
  try {
    await asUser(user.id, async (tx) => {
      if (on) {
        const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(drafts)
          .where(and(inArray(drafts.status, ["scheduled", "published"]), sql`${drafts.gate}->>'verdict' = 'ok'`));
        if (c.n < LIMITS.autoPublishAfter) throw new Error(`Approve ${LIMITS.autoPublishAfter - c.n} more clean draft${LIMITS.autoPublishAfter - c.n > 1 ? "s" : ""} first.`);
      }
      await tx.update(profiles).set({ autoPublish: on }).where(eq(profiles.userId, user.id));
    });
    revalidatePath("/app/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}
