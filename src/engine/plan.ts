// Volume planner: turns "N comments a day" or "N posts a week" into schedule rows. Pure, so it is
// tested without a database (tests/plan.test.ts); src/services/plan.ts applies what it returns.
// Ported from the LinkedIn engine's control plane (apps/api/src/plan.ts), keyed by schedule `key`.
//
// Both planners are INCREMENTAL. One more run goes where it does the least harm and one fewer comes
// out of where it is least missed; every other row keeps the time or day the operator gave it,
// including one they dragged by hand. "Redistribute" is the only thing that moves existing runs.
//
//   engage   one row per run a day. +1 lands in the middle of the widest gap inside the active
//            window, never on the hour; -1 switches off the run with the least room around it.
//            Rows named in `keep` go last.
//   posting  the three slot rows A-C; volume is their Mon..Sun masks. +1 turns on the best
//            (slot, day) still off — weekdays before weekends, slots in the configured order,
//            A-B-C by default; -1 turns off the worst one on.

import { PLANNER } from "@/lib/catalog";

export const ENGAGE_MAX_PER_DAY = PLANNER.commentsPerDayMax;   // past this LinkedIn reads the account as automated
export const POSTS_MAX_PER_WEEK = PLANNER.postsPerWeekMax;     // three slots x seven days
const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const QUIET_START = hm(PLANNER.quietHours[0]);          // nothing is ever planned from here (the user's own time)...
export const QUIET_END = hm(PLANNER.quietHours[1]);            // ...to here

export type EngageRow = { key: string; local_time: string; mode: string };
export type EngagePrefs = { window: [string, string]; min_gap: number };
export type EngagePlan = {
  on: { key: string; local_time: string; created: boolean }[];   // rows to switch on / create, with their time
  off: string[];                                                         // rows to switch off
  moved: { key: string; from: string; local_time: string }[];    // redistribute only
  per_day: number;
  redistributed?: boolean;                                                // + ran out of room and respaced everything
};

export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** A minute that is not on the hour or the half hour: a comment at :00 every hour reads as a bot. */
export function offRound(m: number, lo: number, hi: number): number {
  let t = Math.round(m);
  if (t % 30 === 0) t += t % 60 === 0 ? 7 : -4;
  return Math.min(hi, Math.max(lo, t));
}

export function checkEngagePrefs(p: EngagePrefs): string | null {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!Array.isArray(p.window) || p.window.length !== 2 || !p.window.every((t) => re.test(t))) return "window must be two HH:MM times";
  const [s, e] = p.window.map(toMin);
  if (s < QUIET_END || e > QUIET_START) return `the window must sit inside ${PLANNER.quietHours[1]}-${PLANNER.quietHours[0]} (the quiet hours are not negotiable)`;
  if (e - s < 60) return "the window must be at least an hour long";
  if (!Number.isInteger(p.min_gap) || p.min_gap < 10 || p.min_gap > 120) return "min_gap must be 10-120 minutes";
  return null;
}

const DEFAULT_KEEP: string[] = [];

/** Where the widest gap in `times` (sorted minutes) is, inside [lo, hi]. Edges count as half a gap:
 *  a run placed at the very edge of the window is worse than one between two runs. */
function widestGap(times: number[], lo: number, hi: number): { at: number; room: number } {
  if (!times.length) return { at: (lo + hi) / 2, room: hi - lo };
  let best = { at: lo, room: -1 };
  const consider = (at: number, room: number) => { if (room > best.room) best = { at, room }; };
  consider(lo, times[0] - lo);                                   // before the first: place AT the edge side
  for (let i = 1; i < times.length; i++) consider((times[i - 1] + times[i]) / 2, (times[i] - times[i - 1]) / 2);
  consider(hi, hi - times[times.length - 1]);
  return best;
}

export function planEngage(rows: EngageRow[], target: number, prefs: EngagePrefs, opts: { redistribute?: boolean; keep?: string[] } = {}): EngagePlan | { error: string } {
  if (!Number.isInteger(target) || target < 0 || target > ENGAGE_MAX_PER_DAY) return { error: `comments a day must be 0-${ENGAGE_MAX_PER_DAY}` };
  const bad = checkEngagePrefs(prefs);
  if (bad) return { error: bad };
  const [lo, hi] = prefs.window.map(toMin);
  if (target > 1 && (hi - lo) / (target - 1) < prefs.min_gap)
    return { error: `${target} runs do not fit ${prefs.window[0]}-${prefs.window[1]} at least ${prefs.min_gap} minutes apart — widen the window or lower the gap` };
  const keep = opts.keep ?? DEFAULT_KEEP;
  const active = rows.filter((r) => r.mode !== "off").map((r) => ({ id: r.key, t: toMin(r.local_time) }));
  const spare = rows.filter((r) => r.mode === "off").map((r) => r.key).sort();
  const plan: EngagePlan = { on: [], off: [], moved: [], per_day: target };
  let taken = new Set(rows.map((r) => r.key));
  const nextId = () => {
    const re = spare.shift();
    if (re) return { id: re, created: false };
    let n = 1;
    while (taken.has(`engage:${String(n).padStart(2, "0")}`)) n++;
    const id = `engage:${String(n).padStart(2, "0")}`;
    taken = new Set([...taken, id]);
    return { id, created: true };
  };

  if (opts.redistribute) {
    // Even spacing over the window, then the same off-the-hour nudge. Existing active rows keep their
    // ids in time order (keepers first), so run history stays attached to the same rows.
    const slots = Array.from({ length: target }, (_, i) => offRound(lo + ((i + 0.5) * (hi - lo)) / target, lo, hi));
    const ordered = [...active].sort((a, b) => Number(keep.includes(b.id)) - Number(keep.includes(a.id)) || a.t - b.t);
    const use = ordered.slice(0, target).sort((a, b) => a.t - b.t);
    for (const r of ordered.slice(target)) plan.off.push(r.id);
    const ids: { id: string; created: boolean; from?: number }[] = use.map((r) => ({ id: r.id, created: false, from: r.t }));
    while (ids.length < target) ids.push(nextId());
    ids.forEach((x, i) => {
      if (x.from === undefined) plan.on.push({ key: x.id, local_time: toTime(slots[i]), created: x.created });
      else if (x.from !== slots[i]) plan.moved.push({ key: x.id, from: toTime(x.from), local_time: toTime(slots[i]) });
    });
    return plan;
  }

  const times = active.map((a) => a.t).sort((a, b) => a - b);
  let cur = [...active];
  while (cur.length > target) {
    // the run whose neighbours are closest: removing it opens the smallest hole
    const sorted = [...cur].sort((a, b) => a.t - b.t);
    let worst = -1, worstRoom = Infinity;
    sorted.forEach((r, i) => {
      if (keep.includes(r.id) && sorted.some((x) => !keep.includes(x.id))) return;
      const left = i > 0 ? r.t - sorted[i - 1].t : r.t - lo;
      const right = i < sorted.length - 1 ? sorted[i + 1].t - r.t : hi - r.t;
      const room = left + right;
      if (room < worstRoom) { worstRoom = room; worst = i; }
    });
    const gone = sorted[worst];
    plan.off.push(gone.id);
    cur = cur.filter((r) => r.id !== gone.id);
  }
  let placed = times.filter((t) => cur.some((c) => c.t === t));
  while (cur.length + plan.on.length < target) {
    const g = widestGap(placed, lo, hi);
    // No hole is wide enough any more, but the count still fits the window: respace everything
    // rather than refuse. The result says so, and the console shows every run that moves.
    if (g.room < prefs.min_gap) return { ...(planEngage(rows, target, prefs, { ...opts, redistribute: true }) as EngagePlan), redistributed: true };
    const at = offRound(g.at, lo, hi);
    const { id, created } = nextId();
    plan.on.push({ key: id, local_time: toTime(at), created });
    placed = [...placed, at].sort((a, b) => a - b);
  }
  return plan;
}

// ---------------------------------------------------------------- posting
export type PostingRow = { key: string; slot: string; days: string; mode: string };
export type PostingPlan = { rows: { key: string; days: string; mode_off: boolean; mode_on: boolean }[]; per_week: number };

/** Every (slot, weekday) in the order they are turned on: weekdays first, slots in `order`. */
export function postingPriority(order: string[] = ["A", "B", "C"]): [string, number][] {
  const out: [string, number][] = [];
  for (const days of [[0, 1, 2, 3, 4], [5, 6]]) for (const s of order) for (const d of days) out.push([s, d]);
  return out;
}

export function postsPerWeek(rows: PostingRow[]): number {
  return rows.filter((r) => r.mode !== "off").reduce((n, r) => n + [...r.days].filter((c) => c === "1").length, 0);
}

export function planPosting(rows: PostingRow[], target: number, order: string[] = ["A", "B", "C"]): PostingPlan | { error: string } {
  if (!Number.isInteger(target) || target < 0 || target > POSTS_MAX_PER_WEEK) return { error: `posts a week must be 0-${POSTS_MAX_PER_WEEK}` };
  if (order.length !== 3 || new Set(order).size !== 3 || !order.every((s) => ["A", "B", "C"].includes(s))) return { error: "slot order must be A, B and C once each" };
  const by = new Map(rows.map((r) => [r.slot, r]));
  // effective grid: an off row contributes no days
  const grid = new Map<string, boolean[]>();
  for (const s of ["A", "B", "C"]) {
    const r = by.get(s);
    grid.set(s, Array.from({ length: 7 }, (_, d) => Boolean(r && r.mode !== "off" && r.days[d] === "1")));
  }
  const pri = postingPriority(order);
  let n = [...grid.values()].reduce((a, g) => a + g.filter(Boolean).length, 0);
  for (const [s, d] of pri) { if (n >= target) break; if (by.has(s) && !grid.get(s)![d]) { grid.get(s)![d] = true; n++; } }
  for (const [s, d] of [...pri].reverse()) { if (n <= target) break; if (grid.get(s)![d]) { grid.get(s)![d] = false; n--; } }
  const out: PostingPlan["rows"] = [];
  for (const s of ["A", "B", "C"]) {
    const r = by.get(s);
    if (!r) continue;
    const g = grid.get(s)!;
    const any = g.some(Boolean);
    // days must keep at least one '1' (checkPatch): a slot with none is switched off and keeps its old mask
    const days = any ? g.map((x) => (x ? "1" : "0")).join("") : r.days;
    const wasOn = r.mode !== "off";
    if (days !== r.days || wasOn !== any) out.push({ key: r.key, days, mode_off: wasOn && !any, mode_on: !wasOn && any });
  }
  return { rows: out, per_week: n };
}
