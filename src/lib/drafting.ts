// Check-in -> drafts. Runs in the worker. Every step that shapes a draft is recorded in drafts.gate
// so the user can see why the draft reads the way it does.
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, inputs, jobs, llmUsage, platformAccounts, profiles, publications } from "@/db/schema";
import { nextSlotTimes, type Cadence } from "@/engine/schedule";
import { postingSlots } from "@/services/plan";
import { LIMITS } from "@/lib/catalog";
import { evaluate, pickBest, type Context, type Evaluation } from "@/engine/evaluate";
import type { GateRecord } from "@/engine/types";
import { writer, type Brief, type Model, type Usage } from "@/lib/llm";
import { enqueue } from "@/lib/jobs";
import { push } from "@/lib/push";

export class CapReached extends Error {}

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

/** Spend this calendar month, in dollars. */
export async function monthSpend(userId: string) {
  const [r] = await asUser(userId, (tx) => tx.select({ usd: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)` })
    .from(llmUsage).where(gte(llmUsage.createdAt, monthStart())));
  return Number(r.usd);
}

/** Check the cap and record the spend in one transaction, holding the user's profile row, so two
 *  jobs for the same user can't both slip under the cap. */
async function spend(userId: string, run: () => Promise<Usage>): Promise<Usage> {
  return asUser(userId, async (tx) => {
    await tx.execute(sql`select 1 from profiles where user_id = ${userId} for update`);
    const [r] = await tx.select({ usd: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)` }).from(llmUsage).where(gte(llmUsage.createdAt, monthStart()));
    if (Number(r.usd) >= LIMITS.monthlyCapUsd) throw new CapReached(`This month's $${LIMITS.monthlyCapUsd} drafting allowance is used up. Drafting resumes on the 1st.`);
    const usage = await run();
    await tx.insert(llmUsage).values({ userId, model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, costUsd: usage.costUsd.toFixed(6) });
    return usage;
  });
}

export async function draftFromCheckin(userId: string, inputId: string) {
  const { profile, input, recent, account } = await asUser(userId, async (tx) => ({
    profile: (await tx.select().from(profiles).where(eq(profiles.userId, userId)))[0],
    input: (await tx.select().from(inputs).where(eq(inputs.id, inputId)))[0],
    recent: (await tx.select({ body: drafts.body }).from(drafts)
      .where(inArray(drafts.status, ["scheduled", "published"])).orderBy(desc(drafts.createdAt)).limit(LIMITS.repeatLookback)).map((r) => r.body),
    account: (await tx.select().from(platformAccounts).where(and(eq(platformAccounts.platform, "linkedin"), eq(platformAccounts.status, "active"))).limit(1))[0],
  }));
  if (!profile || !input) return;

  const cadence = profile.cadence as { perWeek: number };
  const brief: Brief = {
    about: profile.about as Brief["about"],
    facts: profile.facts as string[], voiceSamples: profile.voiceSamples as string[],
    topics: profile.topics as string[], noGo: profile.noGo as string[],
    notes: input.body, recent, count: Math.min(Math.max(cadence.perWeek ?? 3, 1), 5), model: profile.model as Model,
  };
  const ctx: Context = { facts: brief.facts, notes: [brief.notes], topics: brief.topics, noGo: brief.noGo, recent };
  const w = writer();

  let posts: Awaited<ReturnType<typeof w.write>>["posts"] = [];
  const first = await spend(userId, async () => { const r = await w.write(brief); posts = r.posts; return r.usage; });
  const share = first.costUsd / Math.max(posts.length, 1);

  let ready = 0, held = 0;
  for (const post of posts) {
    const evals = post.variants.map((v) => evaluate(v, ctx));
    let best: Evaluation = pickBest(evals);
    let rewritten = false, cost = share;
    const adjustments = [...best.fixes];

    if (best.verdict === "rewrite") {
      const problems = best.checks.filter((c) => c.outcome === "rewrite").map((c) => `${c.label}: ${c.detail ?? ""}`);
      let text = best.text;
      const u = await spend(userId, async () => { const r = await w.rewrite(brief, best.text, problems); text = r.text; return r.usage; });
      cost += u.costUsd; rewritten = true;
      const again = evaluate(text, ctx);
      adjustments.push(`Rewritten once to fix: ${problems.map((p) => p.split(":")[0].toLowerCase()).join(", ")}`, ...again.fixes);
      best = again;
      if (again.verdict === "rewrite") {
        best = { ...again, verdict: "held", checks: again.checks.map((c) => (c.outcome === "rewrite" ? { ...c, outcome: "held" as const, detail: `${c.detail ?? ""} (still after one rewrite)` } : c)) };
      }
    }

    const gate: GateRecord = {
      angle: post.angle, why: post.why, checks: best.checks, adjustments,
      verdict: best.verdict === "held" ? "held" : "ok", rewritten,
      model: first.model, costUsd: Math.round(cost * 10000) / 10000, variantsConsidered: post.variants.length,
    };
    if (gate.verdict === "held") held++; else ready++;
    await asUser(userId, async (tx) => {
      const [d] = await tx.insert(drafts).values({
        userId, platform: "linkedin", platformAccountId: account?.id ?? null, body: best.text, gate,
        status: gate.verdict === "held" ? "held" : "draft", inputIds: [inputId],
      }).returning({ id: drafts.id });
      // Automatic posting: only clean drafts, only once the user has switched it on.
      if (profile.autoPublish && gate.verdict === "ok") await approveInTx(tx, userId, d.id);
    });
  }
  await notifyDrafts(userId, ready, held);
}

// Called at the end of draftFromCheckin (below) once every draft is saved.
export async function notifyDrafts(userId: string, ready: number, held: number) {
  if (ready + held > 0) await push(userId, { kind: "drafts_ready", ready, held }).catch((e) => console.error("[push]", e));
}

// Approval is shared by the server action and automatic posting, so both schedule the same way.
type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

export const bodyHash = (body: string) => createHash("sha256").update(body).digest("hex");

export async function approveInTx(tx: Tx, userId: string, draftId: string, now = new Date()) {
  const [d] = await tx.select().from(drafts).where(eq(drafts.id, draftId));
  if (!d || !["draft", "held"].includes(d.status)) throw new Error("This draft can't be approved in its current state.");
  const [p] = await tx.select({ cadence: profiles.cadence }).from(profiles).where(eq(profiles.userId, userId));
  const taken = [
    ...(await tx.select({ at: drafts.scheduledFor }).from(drafts).where(eq(drafts.status, "scheduled"))).map((r) => r.at),
    ...(await tx.select({ at: publications.publishedAt }).from(publications).where(gte(publications.publishedAt, new Date(now.getTime() - 8 * 86_400_000)))).map((r) => r.at),
  ].filter((x): x is Date => Boolean(x));
  // The planner's posting slots (src/services/plan.ts); the first time, they are made from setup.
  const [slot] = nextSlotTimes(await postingSlots(tx, userId), (p.cadence as Cadence).tz, now, taken);
  if (!slot) throw new Error("No free posting slot in the next two months. Turn on a posting slot or raise posts a week on Plan.");
  await tx.update(drafts).set({ status: "scheduled", approvedBodyHash: bodyHash(d.body), scheduledFor: slot }).where(eq(drafts.id, draftId));
  // A publication the platform clearly refused can be tried again after the user re-approves.
  await tx.delete(publications).where(and(eq(publications.draftId, draftId), eq(publications.status, "failed")));
  // Clear any finished publish job for this draft (from an earlier approve/skip) so the new one is unique.
  await tx.delete(jobs).where(and(eq(jobs.refId, draftId), eq(jobs.kind, "publish"), inArray(jobs.status, ["queued", "done", "failed"])));
  await enqueue(tx, userId, "publish", draftId, slot);
  return slot;
}
