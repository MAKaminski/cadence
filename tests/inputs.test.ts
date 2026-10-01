// The Inputs registry and its direction rules are pure, so each rule is tested on hand-made signals.
import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import { eq } from "drizzle-orm";
import assert from "node:assert/strict";
import { advise, GROUPS, INPUTS, inputsOn, strategy, type Signals } from "@/lib/inputs";

const base: Signals = {
  weeks: [{ posts: 3, target: 3 }, { posts: 3, target: 3 }, { posts: 2, target: 3 }, { posts: 3, target: 3 }],
  target: 3, rate: { recent: null, earlier: null }, bestDay: null, onDays: ["Tue", "Wed", "Thu"],
  month: { approved: 6, edited: 1, held: 0 }, model: "claude-sonnet-5", spentShare: 0.2,
  autoPublish: { on: false, left: 2 }, paused: false, waiting: 0,
  channels: [{ name: "X", connected: false, connectable: true, drafting: null }],
  examples: { rated: 5 }, daysSinceCheckin: 2,
};
const s = (o: Partial<Signals>): Signals => ({ ...base, ...o });

test("every input has a home, a rule and a known group; ids are unique", () => {
  assert.equal(new Set(INPUTS.map((i) => i.id)).size, INPUTS.length);
  for (const i of INPUTS) {
    assert.ok(GROUPS.some((g) => g.id === i.group), i.id);
    assert.ok(i.home.href.startsWith("/"), i.id);
    assert.ok(i.what && i.why && i.rule, i.id);
    assert.ok(advise(i.id, base).reason, i.id);
  }
  assert.deepEqual(inputsOn("/app/plan").map((i) => i.id), ["postsPerWeek", "slots", "commentsPerDay", "commentWindow", "pause"]);
  assert.deepEqual(inputsOn("/app").map((i) => i.id), ["checkin"]);
});

test("posts a week: decrease when under 75% of target, increase when on target and engagement held", () => {
  assert.equal(advise("postsPerWeek", s({ weeks: base.weeks.map(() => ({ posts: 2, target: 3 })) })).direction, "decrease"); // 2 < 2.25
  assert.equal(advise("postsPerWeek", base).direction, "maintain");                                                              // no numbers yet
  const up = advise("postsPerWeek", s({ rate: { recent: 0.05, earlier: 0.04 } }));
  assert.equal(up.direction, "increase");
  assert.equal(up.href, "/app/results#impact");
  assert.equal(advise("postsPerWeek", s({ rate: { recent: 0.03, earlier: 0.04 } })).direction, "maintain");
  assert.equal(advise("postsPerWeek", s({ weeks: base.weeks.map(() => ({ posts: 0, target: 3 })) })).direction, "maintain"); // nothing to judge
  assert.match(strategy(s({ rate: { recent: 0.05, earlier: 0.04 } })).reason, /^Grow: /);
});

test("slots: add your best weekday when no slot posts then", () => {
  assert.equal(advise("slots", s({ bestDay: { label: "Mon", rate: 0.06, posts: 3 } })).direction, "increase");
  assert.equal(advise("slots", s({ bestDay: { label: "Tue", rate: 0.06, posts: 3 } })).direction, "maintain");
});

test("setup inputs follow held, edited and engagement signals", () => {
  assert.equal(advise("facts", s({ month: { ...base.month, held: 2 } })).direction, "increase");
  assert.equal(advise("voiceSamples", s({ month: { approved: 4, edited: 3, held: 0 } })).direction, "increase");
  assert.equal(advise("voiceSamples", s({ month: { approved: 2, edited: 2, held: 0 } })).direction, "maintain"); // too few to judge
  assert.equal(advise("topics", s({ rate: { recent: 0.03, earlier: 0.04 } })).direction, "increase");
  assert.equal(advise("topics", s({ rate: { recent: 0.035, earlier: 0.04 } })).direction, "maintain");
  assert.equal(advise("model", s({ model: "claude-opus-5", spentShare: 0.85 })).direction, "decrease");
  assert.equal(advise("model", s({ spentShare: 0.85 })).direction, "maintain");
});

test("switches and lists: resume, unlock, connect, rate, check in", () => {
  assert.equal(advise("pause", s({ paused: true, waiting: 2 })).direction, "increase");
  assert.equal(advise("autoPublish", base).direction, "maintain");
  assert.equal(advise("autoPublish", s({ autoPublish: { on: false, left: 0 } })).direction, "increase");
  assert.equal(advise("autoPublish", s({ autoPublish: { on: false, left: 0 }, month: { ...base.month, held: 1 } })).direction, "maintain");
  assert.equal(advise("channels", base).direction, "increase");
  assert.equal(advise("channelDrafting", s({ channels: [{ name: "X", connected: true, connectable: true, drafting: false }] })).direction, "increase");
  assert.equal(advise("examples", s({ examples: { rated: 1 } })).direction, "increase");
  assert.equal(advise("checkin", s({ daysSinceCheckin: null })).direction, "increase");
  assert.equal(advise("checkin", s({ daysSinceCheckin: 9 })).direction, "increase");
  assert.equal(advise("commentsPerDay", base).direction, "maintain");
});

// The demo's sample-history scenarios, through the real signals: each must tell the story it claims.
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("sample-history scenarios drive the directions", () => {
  let db: typeof import("@/db"), s: typeof import("@/db/schema");
  let seed: typeof import("@/services/sample-history"), inputs: typeof import("@/services/inputs");
  const id = (k: string) => `sample-${k}-${Date.now()}`;
  const made: string[] = [];

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters" });
    db = await import("@/db"); s = await import("@/db/schema");
    seed = await import("@/services/sample-history"); inputs = await import("@/services/inputs");
  });
  afterAll(async () => { for (const u of made) await db.db.delete(s.user).where(eq(s.user.id, u)); });

  async function directions(scenario: "grow" | "ease") {
    const U = id(scenario); made.push(U);
    await db.db.insert(s.user).values({ id: U, name: U, email: `${U}@example.com`, emailVerified: false });
    await db.asUser(U, (tx) => tx.insert(s.profiles).values({
      userId: U, about: { role: "CFO", audience: "Founders", goals: "Clients" }, facts: ["Former controller"], voiceSamples: [], topics: ["cash"], noGo: [],
      onboardingStep: 4, cadence: { perWeek: 3, days: ["Tue", "Wed", "Thu"], time: "09:00", tz: "UTC" },
    }));
    await seed.addSampleHistory(U, scenario);
    const sig = (await inputs.signals(U)).signals;
    return { strategy: strategy(sig).direction, of: (k: Parameters<typeof advise>[0]) => advise(k, sig).direction, reason: (k: Parameters<typeof advise>[0]) => advise(k, sig).reason };
  }

  it("ready to grow: more posts and a Monday slot", async () => {
    const d = await directions("grow");
    expect(d.strategy).toBe("increase");
    expect([d.of("postsPerWeek"), d.of("slots"), d.of("autoPublish")]).toEqual(["increase", "increase", "increase"]);
    expect([d.of("facts"), d.of("model"), d.of("pause")]).toEqual(["maintain", "maintain", "maintain"]);
  });

  it("overstretched: fewer posts, a cheaper model, fresh topics, facts and samples, and resume", async () => {
    const d = await directions("ease");
    expect(d.strategy).toBe("decrease");
    expect([d.of("postsPerWeek"), d.of("model")]).toEqual(["decrease", "decrease"]);
    expect(d.reason("postsPerWeek")).toMatch(/published 1\.0 a week against 3/); // the edited posts sit outside the 4 weeks
    expect([d.of("facts"), d.of("voiceSamples"), d.of("topics"), d.of("pause")]).toEqual(["increase", "increase", "increase", "increase"]);
  });
});
