// The volume planner is pure, so "one more / one fewer" is tested without a database. Ported with the
// planner from the LinkedIn engine; `keep` stands in for the engine's two history-carrying rows.
import { test } from "vitest";
import assert from "node:assert/strict";
import { planEngage, planPosting, postsPerWeek, toMin, POSTS_MAX_PER_WEEK, type EngagePlan, type EngagePrefs, type PostingPlan } from "@/engine/plan";

const KEEP = { keep: ["engage:A", "engage:B"] };
const err = (p: unknown): string => (p as { error: string }).error;
const ok = <T,>(p: T | { error: string }): T => { if (p && typeof p === "object" && "error" in p) throw new Error(p.error); return p as T; };

const PREFS: EngagePrefs = { window: ["06:30", "21:30"], min_gap: 15 };
// today's 20 rows (migration 0005)
const TIMES = ["07:34", "12:04", "06:52", "07:51", "08:09", "08:26", "09:41", "10:47", "11:38", "12:22", "12:41",
  "13:02", "14:13", "15:19", "16:27", "17:21", "17:39", "17:58", "19:04", "20:16"];
const IDS = ["engage:A", "engage:B", ...Array.from({ length: 18 }, (_, i) => `engage:${String(i + 3).padStart(2, "0")}`)];
const ROWS = IDS.map((id, i) => ({ key: id, local_time: TIMES[i], mode: "live" }));

test("+1 lands in the widest gap, off the hour, as a new row", () => {
  const p = ok<EngagePlan>(planEngage(ROWS, 21, PREFS));
  assert.equal(p.on.length, 1);
  assert.deepEqual(p.off, []);
  assert.equal(p.on[0].key, "engage:01");   // numbering starts at 01 for a user's own rows
  assert.equal(p.on[0].created, true);
  const m = toMin(p.on[0].local_time);
  assert.ok(m >= toMin("20:16") && m <= toMin("21:30"), p.on[0].local_time);   // the evening tail is the widest gap
  assert.notEqual(m % 30, 0);
});

test("-1 removes the most crowded run and never engage:A or engage:B while others remain", () => {
  const p = ok<EngagePlan>(planEngage(ROWS, 19, PREFS, KEEP));
  assert.equal(p.off.length, 1);
  assert.ok(!["engage:A", "engage:B"].includes(p.off[0]));
  const q = ok<EngagePlan>(planEngage(ROWS, 2, PREFS, KEEP));
  assert.equal(q.off.length, 18);
  assert.ok(!q.off.includes("engage:A") && !q.off.includes("engage:B"));
});

test("switched-off rows are reused before new ones are created; untouched rows keep their times", () => {
  const rows = ROWS.map((r) => (r.key === "engage:07" ? { ...r, mode: "off" } : r));
  const p = ok<EngagePlan>(planEngage(rows, 21, PREFS));
  assert.deepEqual(p.on.map((x) => [x.key, x.created]), [["engage:07", false], ["engage:01", true]]);
  assert.deepEqual(p.moved, []);
});

test("every planned time stays inside the window and at least min_gap from its neighbours", () => {
  let rows: { key: string; local_time: string; mode: string }[] = [];
  for (let n = 1; n <= 40; n++) {
    const p = ok<EngagePlan>(planEngage(rows, n, { window: ["06:30", "21:30"] as [string, string], min_gap: 15 }));
    
    const moved = Object.fromEntries(p.moved.map((m) => [m.key, m.local_time]));
    rows = rows.map((r) => (moved[r.key] ? { ...r, local_time: moved[r.key] } : r));
    for (const r of p.on) rows.push({ key: r.key, local_time: r.local_time, mode: "shadow" });
    const ts = rows.map((r) => toMin(r.local_time)).sort((a, b) => a - b);
    assert.ok(ts[0] >= toMin("06:30") && ts.at(-1)! <= toMin("21:30"));
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 11, `n=${n} gap ${ts[i] - ts[i - 1]}`);   // nudged off :00/:30 by up to 7
    if (n === 40) assert.ok(rows.length === 40);
  }
});

test("limits: quiet hours, the ceiling, and a window too small for the count", () => {
  assert.match(err(planEngage(ROWS, 41, PREFS)), /0-40/);
  assert.match(err(planEngage(ROWS, 20, { window: ["05:00", "21:00"] as [string, string], min_gap: 15 })), /06:00-22:00/);
  assert.match(err(planEngage([], 40, { window: ["08:00", "12:00"] as [string, string], min_gap: 15 })), /do not fit/);
  const zero = ok<EngagePlan>(planEngage(ROWS, 0, PREFS));
  assert.equal(zero.off.length, 20);
});

test("redistribute spreads evenly and keeps existing ids", () => {
  const p = ok<EngagePlan>(planEngage(ROWS, 20, PREFS, { redistribute: true }));
  assert.equal(p.on.length, 0);
  assert.equal(p.off.length, 0);
  assert.ok(p.moved.length > 10);
  const q = ok<EngagePlan>(planEngage(ROWS, 10, PREFS, { redistribute: true, ...KEEP }));
  assert.equal(q.off.length, 10);
  assert.ok(!q.off.includes("engage:A") && !q.off.includes("engage:B"));
});

const POST = [
  { key: "posting:A", slot: "A", days: "1111111", mode: "live" },
  { key: "posting:B", slot: "B", days: "1111111", mode: "live" },
  { key: "posting:C", slot: "C", days: "1111111", mode: "live" },
];

test("posting: -N drops weekends of the worst slot first, then weekdays; 0 switches every slot off", () => {
  assert.equal(postsPerWeek(POST), 21);
  const p = ok<PostingPlan>(planPosting(POST, 19));
  assert.deepEqual(p.rows, [{ key: "posting:C", days: "1111100", mode_off: false, mode_on: false }]);
  const q = ok<PostingPlan>(planPosting(POST, 10));          // B weekdays + A weekdays
  assert.equal(q.per_week, 10);
  const byId = Object.fromEntries(q.rows.map((r) => [r.key, r]));
  assert.equal(byId["posting:A"].days, "1111100");
  assert.equal(byId["posting:B"].days, "1111100");
  assert.equal(byId["posting:C"].mode_off, true);
  const z = ok<PostingPlan>(planPosting(POST, 0));
  assert.ok(z.rows.every((r) => r.mode_off));
});

test("posting: +N turns a switched-off slot back on, weekdays first, in the configured order", () => {
  const rows = [{ ...POST[0], days: "1111100" }, { ...POST[1], days: "1111100" }, { ...POST[2], mode: "off" }];
  const p = ok<PostingPlan>(planPosting(rows, 12));          // weekdays of every slot come before any weekend
  assert.deepEqual(p.rows, [{ key: "posting:C", days: "1100000", mode_off: false, mode_on: true }]);
  const q = ok<PostingPlan>(planPosting(rows, 13, ["C", "B", "A"]));
  assert.equal(q.rows.find((r) => r.key === "posting:C")?.mode_on, true);
  assert.equal(q.rows.find((r) => r.key === "posting:C")?.days, "1110000");
  assert.match(err(planPosting(rows, POSTS_MAX_PER_WEEK + 1)), /0-21/);
});

import { cadenceFromSlots, nextSlotTimes, nextSlots } from "@/engine/schedule";

test("several slots a day: approved posts take the next free slot time in order", () => {
  const monday = new Date("2026-09-28T12:00:00Z");   // 08:00 New York
  const slots = [{ time: "09:00", days: "1111100" }, { time: "12:30", days: "1111100" }, { time: "17:30", days: "0000000" }];
  const got = nextSlotTimes(slots, "America/New_York", monday, [], 3).map((d) => d.toISOString());
  assert.deepEqual(got, ["2026-09-28T13:00:00.000Z", "2026-09-28T16:30:00.000Z", "2026-09-29T13:00:00.000Z"]);
  const [next] = nextSlotTimes(slots, "America/New_York", monday, [new Date("2026-09-28T13:00:00Z")]);
  assert.equal(next.toISOString(), "2026-09-28T16:30:00.000Z");
  assert.deepEqual(nextSlotTimes([{ time: "09:00", days: "0000000" }], "America/New_York", monday, []), []);
});

test("one slot on the same days schedules exactly like the setup cadence it replaced", () => {
  const monday = new Date("2026-09-28T12:00:00Z");
  const cadence = { perWeek: 3, days: ["Tue", "Wed", "Thu"], time: "09:00", tz: "America/New_York" };
  const slot = [{ time: "09:00", days: "0111000" }];
  assert.deepEqual(nextSlotTimes(slot, cadence.tz, monday, [], 6), nextSlots(cadence, monday, [], 6));
  assert.deepEqual(cadenceFromSlots([...slot, { time: "17:30", days: "0000000" }], cadence.tz), cadence);
});
