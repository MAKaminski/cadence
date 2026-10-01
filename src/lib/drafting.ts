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
import { spec } from "@/platforms/registry";
import { enqueue } from "@/lib/jobs";
import { push } from "@/lib/push";
import { flagOnFor } from "@/lib/flags";
import { guidance, guidanceText } from "@/services/examples";

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
export async function spend(userId: string, run: () => Promise<Usage>): Promise<Usage> {
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
  const { profile, input, recent, accounts } = await asUser(userId, async (tx) => ({
    profile: (await tx.select().from(profiles).where(eq(profiles.userId, userId)))[0],
    input: (await tx.select().from(inputs).where(eq(inputs.id, inputId)))[0],
    recent: (await tx.select({ body: drafts.body }).from(drafts)
      .where(inArray(drafts.status, ["scheduled", "published"])).orderBy(desc(drafts.createdAt)).limit(LIMITS.repeatLookback)).map((r) => r.body),
    accounts: await tx.select().from(platformAccounts).where(eq(platformAccounts.status, "active")),
  }));
  const account = accounts.find((a) => a.platform === "linkedin");
  // Other connected channels with drafting on get their own version of every post (X today).
  const channels = accounts.filter((a) => a.platform !== "linkedin" && a.drafting && spec(a.platform).status === "live" && !spec(a.platform).needsMedia);
  if (!profile || !input) return;

  const cadence = profile.cadence as { perWeek: number };
  const brief: Brief = {
    about: profile.about as Brief["about"],
    facts: profile.facts as string[], voiceSamples: profile.voiceSamples as string[],
    topics: profile.topics as string[], noGo: profile.noGo as string[],
    notes: input.body, recent, count: Math.min(Math.max(cadence.perWeek ?? 3, 1), 5), model: profile.model as Model,
  };
  // Rated examples steer the writer when the feature is on for this person.
  const taught = (await flagOnFor("examples", userId)) ? await guidance(userId) : null;
  const examplesText = taught && guidanceText(taught);
  if (examplesText) brief.examples = examplesText;
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
      ...(examplesText && taught ? { examples: { up: taught.up, down: taught.down } } : {}),
    };
    if (gate.verdict === "held") held++; else ready++;
    const sourceId = await asUser(userId, async (tx) => {
      const [d] = await tx.insert(drafts).values({
        userId, platform: "linkedin", platformAccountId: account?.id ?? null, body: best.text, gate,
        status: gate.verdict === "held" ? "held" : "draft", inputIds: [inputId],
      }).returning({ id: drafts.id });
      // Automatic posting: only clean drafts, only once the user has switched it on.
      if (profile.autoPublish && gate.verdict === "ok") await approveInTx(tx, userId, d.id);
      return d.id;
    });

    for (const ch of channels) {
      const r = await adaptDraft(userId, brief, ctx, best.text, ch, post, sourceId, inputId, profile.autoPublish);
      if (r === "held") held++; else ready++;
    }
  }
  await notifyDrafts(userId, ready, held);
}

type Account = typeof platformAccounts.$inferSelect;

/** One post rewritten for another channel, checked against that channel's limits, rewritten once if
 *  it misses, and saved as its own draft (approved, scheduled and published on its own). */
async function adaptDraft(userId: string, brief: Brief, ctx: Context, source: string, ch: Account, post: { angle: string; why: string },
  sourceId: string, inputId: string, autoPublish: boolean): Promise<"ok" | "held"> {
  const s = spec(ch.platform), w = writer();
  const recent = await asUser(userId, async (tx) => (await tx.select({ body: drafts.body }).from(drafts)
    .where(and(eq(drafts.platform, ch.platform), inArray(drafts.status, ["scheduled", "published"]))).orderBy(desc(drafts.createdAt)).limit(LIMITS.repeatLookback)).map((r) => r.body));
  const cctx = { ...ctx, recent };
  let text = "";
  const first = await spend(userId, async () => { const r = await w.adapt(brief, source, s); text = r.text; return r.usage; });
  let cost = first.costUsd, rewritten = false;
  let ev = evaluate(text, cctx, s);
  const adjustments = [`Written for ${s.name} from the LinkedIn draft`, ...ev.fixes];
  if (ev.verdict === "rewrite") {
    const problems = ev.checks.filter((c) => c.outcome === "rewrite").map((c) => `${c.label}: ${c.detail ?? ""}`);
    const u = await spend(userId, async () => { const r = await w.adapt(brief, source, s, problems); text = r.text; return r.usage; });
    cost += u.costUsd; rewritten = true;
    ev = evaluate(text, cctx, s);
    adjustments.push(`Rewritten once to fix: ${problems.map((p) => p.split(":")[0].toLowerCase()).join(", ")}`, ...ev.fixes);
    if (ev.verdict === "rewrite") ev = { ...ev, verdict: "held", checks: ev.checks.map((c) => (c.outcome === "rewrite" ? { ...c, outcome: "held" as const, detail: `${c.detail ?? ""} (still after one rewrite)` } : c)) };
  }
  const gate: GateRecord = {
    angle: post.angle, why: post.why, checks: ev.checks, adjustments,
    verdict: ev.verdict === "held" ? "held" : "ok", rewritten,
    model: first.model, costUsd: Math.round(cost * 10000) / 10000, variantsConsidered: 1, adaptedFrom: sourceId,
  };
  await asUser(userId, async (tx) => {
    const [d] = await tx.insert(drafts).values({
      userId, platform: ch.platform, platformAccountId: ch.id, body: ev.text, gate,
      status: gate.verdict === "held" ? "held" : "draft", inputIds: [inputId],
    }).returning({ id: drafts.id });
    if (autoPublish && gate.verdict === "ok") await approveInTx(tx, userId, d.id);
  });
  return gate.verdict;
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
    // Slots are per channel: a LinkedIn post and its X version can go out in the same slot.
    ...(await tx.select({ at: drafts.scheduledFor }).from(drafts).where(and(eq(drafts.status, "scheduled"), eq(drafts.platform, d.platform)))).map((r) => r.at),
    ...(await tx.select({ at: publications.publishedAt }).from(publications).where(and(eq(publications.platform, d.platform), gte(publications.publishedAt, new Date(now.getTime() - 8 * 86_400_000))))).map((r) => r.at),
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
