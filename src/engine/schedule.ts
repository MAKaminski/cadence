// Posting slots in the user's own time zone. Pure: `now` and already-taken slots are passed in.

export type Cadence = { perWeek: number; days: string[]; time: string; tz: string };
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: p.weekday as string };
}

/** The UTC instant of a wall-clock time in `tz` (handles DST by re-checking the offset). */
export function zoned(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  let t = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    t += Date.UTC(y, m - 1, d, h, min) - shown;
  }
  return new Date(t);
}

/** Monday-based week key in the user's zone, so "3 a week" means their week. */
function weekKey(d: Date, tz: string) {
  const p = parts(d, tz);
  const local = Date.UTC(p.y, p.m - 1, p.d);
  const monday = local - ((DAY.indexOf(p.wd) + 6) % 7) * 86_400_000;
  return new Date(monday).toISOString().slice(0, 10);
}

/** The next `n` free slots after `now` (at least `leadMinutes` out), respecting days and posts/week. */
export function nextSlots(c: Cadence, now: Date, taken: Date[], n = 1, leadMinutes = 15): Date[] {
  const [h, min] = c.time.split(":").map(Number);
  const perWeek = new Map<string, number>();
  for (const t of taken) perWeek.set(weekKey(t, c.tz), (perWeek.get(weekKey(t, c.tz)) ?? 0) + 1);
  const takenMs = new Set(taken.map((t) => t.getTime()));
  const out: Date[] = [];
  const start = parts(now, c.tz);
  for (let i = 0; i < 60 && out.length < n; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const slot = zoned(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, min, c.tz);
    if (!c.days.includes(DAY[day.getUTCDay()])) continue;
    if (slot.getTime() < now.getTime() + leadMinutes * 60_000 || takenMs.has(slot.getTime())) continue;
    const k = weekKey(slot, c.tz);
    if ((perWeek.get(k) ?? 0) >= c.perWeek) continue;
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
    out.push(slot);
  }
  return out;
}

/** A daily posting slot from the planner: a time and the days it is on (Mon..Sun mask, "1111100"). */
export type Slot = { time: string; days: string };
const MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The planner's slots as the single-slot cadence older callers expect (the API's `profile.cadence`). */
export function cadenceFromSlots(slots: Slot[], tz: string): Cadence {
  const on = slots.filter((s) => s.days.includes("1")).sort((a, b) => a.time.localeCompare(b.time));
  const days = MON_FIRST.filter((_, i) => on.some((s) => s.days[i] === "1"));
  const perWeek = on.reduce((n, s) => n + [...s.days].filter((c) => c === "1").length, 0);
  return { perWeek, days, time: on[0]?.time ?? "09:00", tz };
}

/** The next `n` free times across several daily slots (at least `leadMinutes` out). A week holds at
 *  most as many posts as the slots have days switched on, counting posts already scheduled. */
export function nextSlotTimes(slots: Slot[], tz: string, now: Date, taken: Date[], n = 1, leadMinutes = 15): Date[] {
  const cap = slots.reduce((k, s) => k + [...s.days].filter((c) => c === "1").length, 0);
  if (!cap) return [];
  const perWeek = new Map<string, number>();
  for (const t of taken) perWeek.set(weekKey(t, tz), (perWeek.get(weekKey(t, tz)) ?? 0) + 1);
  const takenMs = new Set(taken.map((t) => t.getTime()));
  const out: Date[] = [];
  const start = parts(now, tz);
  for (let i = 0; i < 60 && out.length < n; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const dow = (day.getUTCDay() + 6) % 7;                    // Monday = 0
    const times = slots.filter((s) => s.days[dow] === "1").map((s) => s.time).sort();
    for (const t of times) {
      if (out.length >= n) break;
      const [h, min] = t.split(":").map(Number);
      const slot = zoned(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, min, tz);
      if (slot.getTime() < now.getTime() + leadMinutes * 60_000 || takenMs.has(slot.getTime())) continue;
      const k = weekKey(slot, tz);
      if ((perWeek.get(k) ?? 0) >= cap) continue;
      perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
      out.push(slot);
    }
  }
  return out;
}
