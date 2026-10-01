// Back-dated sample posts with sample results, marked as sample data everywhere. Used by demo mode's
// "sample history" picker and by App Review accounts, so Results and Inputs have a story to tell.
// Three stories: a steady, slightly uneven history; one where results say grow; one where they say ease off.
import { eq } from "drizzle-orm";
import { asUser } from "@/db";
import type { GateRecord } from "@/engine/types";
import { LIMITS } from "@/lib/catalog";
import type { Scenario } from "@/lib/sample-scenarios";

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
const DAY = 86_400_000;
const ANGLES = ["Lesson from the week", "A question I keep getting", "What I'd do differently"];
const OPENERS = [
  "Most founders model revenue first. Model cash first.",
  "A founder asked me this week whether they need a CFO yet.",
  "We closed the books in 4 days. No new software.",
  "Subsidies change the timing of cash, not just the amount.",
  "Grid interconnection queues are a forecasting problem.",
  "The first finance hire should be a habit, not a person.",
];
const gate = (angle: string, why = "Sample history (demo).", verdict: GateRecord["verdict"] = "ok", checks: GateRecord["checks"] = []): GateRecord =>
  ({ angle, why, checks, adjustments: [], verdict, rewritten: false, model: "demo", costUsd: 0, variantsConsidered: 2 });
const bodyOf = (opener: string, n: number) => `${opener}\n\n${"Sample post for the demo history. ".repeat(n)}`.trim();

/** One published LinkedIn post, with numbers 72 hours later unless `rate` is null. */
async function post(tx: Tx, userId: string, at: Date, o: { opener: string; angle: string; rate: number | null; impressions?: number; length?: number; version?: number; draftedAt?: Date }) {
  const { drafts, publications, metrics } = await import("@/db/schema");
  const [d] = await tx.insert(drafts).values({
    userId, platform: "linkedin", body: bodyOf(o.opener, o.length ?? 8), status: "published", version: o.version ?? 1, scheduledFor: at, createdAt: o.draftedAt ?? at, gate: gate(o.angle),
  }).returning({ id: drafts.id });
  const [p] = await tx.insert(publications).values({
    userId, draftId: d.id, platform: "linkedin", status: "published", externalPostId: `urn:li:share:demo-${d.id.slice(0, 8)}`, publishedAt: at, createdAt: at,
  }).returning({ id: publications.id });
  if (o.rate == null) return;
  const impressions = o.impressions ?? 2000;
  await tx.insert(metrics).values({
    userId, publicationId: p.id, platform: "linkedin", capturedAt: new Date(at.getTime() + 72 * 3_600_000),
    impressions, reactions: Math.round(impressions * o.rate * 0.8), comments: Math.round(impressions * o.rate * 0.15), reshares: Math.round(impressions * o.rate * 0.05),
    platformData: { sample: true },
  });
}

/** Monday of this week at 13:00 UTC, so a post `w` weeks back on day `dow` (0 = Monday) falls on that weekday in most time zones. */
function weekday(now: number) {
  const d = new Date(now), monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7), 13);
  return (w: number, dow: number) => new Date(monday - w * 7 * DAY + dow * DAY);
}

export async function addSampleHistory(userId: string, scenario: Scenario = "steady") {
  const now = Date.now(), at = weekday(now);
  await asUser(userId, async (tx) => {
    if (scenario === "steady") {
      for (let w = 8; w >= 1; w--) {
        const perWeek = w % 3 === 0 ? 1 : w % 4 === 0 ? 2 : 3; // a realistic, slightly uneven history
        for (let i = 0; i < perWeek; i++) {
          const angle = ANGLES[(w + i) % 3];
          const impressions = 900 + ((w * 7 + i * 13) % 11) * 310 + (8 - w) * 120;
          const rate = 0.014 + (((w + i * 2) % 6) / 1000) * (angle.startsWith("A question") ? 3 : 1);
          await post(tx, userId, new Date(now - w * 7 * DAY + i * 2 * DAY), { opener: OPENERS[(w * 3 + i) % OPENERS.length], angle, rate, impressions, length: 4 + ((w + i) % 5) * 6 });
        }
      }
      return;
    }
    if (scenario === "grow") {
      // On target (3 a week) for the last 4 full weeks; the 4 latest posts with numbers beat the 4 before;
      // Monday does best and setup's slot doesn't post on Mondays.
      for (const w of [4, 3, 2, 1]) {
        const base = w >= 3 ? 0.018 : 0.03;
        await post(tx, userId, at(w, 0), { opener: OPENERS[1], angle: ANGLES[1], rate: base + 0.012 });
        await post(tx, userId, at(w, 1), { opener: OPENERS[0], angle: ANGLES[0], rate: base });
        await post(tx, userId, at(w, 2), { opener: OPENERS[2], angle: ANGLES[2], rate: base - 0.002 });
      }
      return;
    }
    // ease: two good posts a week in weeks 8–5, then one softer post a week against a target of 3.
    for (const w of [8, 7, 6, 5]) for (const dow of [1, 2]) await post(tx, userId, at(w, dow), { opener: OPENERS[(w + dow) % OPENERS.length], angle: ANGLES[dow], rate: 0.04 });
    for (const w of [4, 3, 2, 1]) await post(tx, userId, at(w, 1), { opener: OPENERS[w], angle: ANGLES[0], rate: 0.02 });
    // This month: three drafts approved after an edit (posted 5 weeks back, outside the 4 weeks the posting
    // rule reads, and without numbers, so neither the average nor the engagement trend moves), two drafts
    // held for a claim not in the facts, Opus at 86% of the allowance, and posting paused.
    const { drafts, holds, llmUsage, profiles } = await import("@/db/schema");
    const today = new Date(now);
    for (let i = 0; i < 3; i++) await post(tx, userId, at(5, 3), { opener: OPENERS[3 + i], angle: ANGLES[0], rate: null, version: 2, draftedAt: today });
    for (let i = 0; i < 2; i++) await tx.insert(drafts).values({
      userId, platform: "linkedin", status: "held", createdAt: today, body: bodyOf("We cut month-end close from 12 days to 3.", 4),
      gate: gate(ANGLES[0], "Sample history (demo): held for a claim not in your facts.", "held", [{ id: "facts", label: "Facts", outcome: "held", detail: "“12 days to 3” isn't in your facts list" }]),
    });
    await tx.update(profiles).set({ model: "claude-opus-5" }).where(eq(profiles.userId, userId));
    await tx.insert(llmUsage).values({ userId, model: "claude-opus-5", tokensIn: 200_000, tokensOut: 40_000, costUsd: (LIMITS.monthlyCapUsd * 0.86).toFixed(2), createdAt: today });
    await tx.insert(holds).values({ userId, name: "all", reason: "Sample history (demo)" }).onConflictDoNothing();
  });
}
