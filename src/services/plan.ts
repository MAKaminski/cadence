// The planner: how much and when. Posting slots (run here) and comment runs (run by the optional Cadence
// runner on the user's machine) are schedule rows; "how many" is a count the pure planner in
// src/engine/plan.ts turns into rows, and dragging a run changes only that row's time.
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { engineSettings, holds, profiles, schedules } from "@/db/schema";
import { PLANNER } from "@/lib/catalog";
import { cadenceFromSlots, type Cadence } from "@/engine/schedule";
import { checkEngagePrefs, planEngage, planPosting, postsPerWeek, QUIET_END, QUIET_START, toMin, type EngagePlan, type EngagePrefs, type PostingPlan } from "@/engine/plan";
import { DAYS } from "./profile";
import { ServiceError } from "./errors";

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
type Row = typeof schedules.$inferSelect;
export type Volume = { engage: EngagePrefs; posting: { slot_order: string[] } };
export const HOLDS = ["all", "engage", "outreach", "jobs"] as const;
export type HoldName = (typeof HOLDS)[number];

const DEFAULT_VOLUME: Volume = {
  engage: { window: [PLANNER.commentWindow[0], PLANNER.commentWindow[1]], min_gap: PLANNER.commentGapMinutes },
  posting: { slot_order: ["A", "B", "C"] },
};
const SLOTS = ["A", "B", "C"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The setup cadence as a Mon..Sun mask: the first `perWeek` of the chosen days. */
export function maskFromCadence(c: Pick<Cadence, "perWeek" | "days">): string {
  let left = Math.max(0, c.perWeek);
  return DAYS.map((d) => (c.days.includes(d) && left-- > 0 ? "1" : "0")).join("");
}

async function cadenceOf(tx: Tx, userId: string): Promise<Cadence> {
  const [p] = await tx.select({ cadence: profiles.cadence }).from(profiles).where(eq(profiles.userId, userId));
  return (p?.cadence ?? { perWeek: 3, days: ["Tue", "Wed", "Thu"], time: PLANNER.slotTimes.A, tz: "America/New_York" }) as Cadence;
}

/** Posting rows exist from the first time anyone looks: slot A from setup, B and C off. */
async function ensurePosting(tx: Tx, userId: string): Promise<Row[]> {
  const have = await tx.select().from(schedules).where(eq(schedules.family, "posting"));
  if (have.length) return have;
  const c = await cadenceOf(tx, userId), mask = maskFromCadence(c);
  await tx.insert(schedules).values(SLOTS.map((s) => ({
    userId, key: `posting:${s}`, family: "posting" as const, slot: s, executor: "hosted" as const,
    localTime: s === "A" ? c.time : PLANNER.slotTimes[s], days: s === "A" && mask.includes("1") ? mask : "1111100",
    mode: (s === "A" && mask.includes("1") ? "live" : "off") as Row["mode"],
  }))).onConflictDoNothing();
  return tx.select().from(schedules).where(eq(schedules.family, "posting"));
}

async function volumeOf(tx: Tx, userId: string): Promise<Volume> {
  const [s] = await tx.select().from(engineSettings).where(eq(engineSettings.userId, userId));
  const v = (s?.volume ?? {}) as Partial<Volume>;
  return { engage: { ...DEFAULT_VOLUME.engage, ...v.engage }, posting: { ...DEFAULT_VOLUME.posting, ...v.posting } };
}

/** The API's `profile.cadence` stays a true summary of the posting rows. */
async function syncCadence(tx: Tx, userId: string) {
  const rows = await tx.select().from(schedules).where(eq(schedules.family, "posting"));
  const tz = (await cadenceOf(tx, userId)).tz;
  const on = rows.filter((r) => r.mode !== "off").map((r) => ({ time: r.localTime, days: r.days }));
  const c = cadenceFromSlots(on, tz);
  await tx.update(profiles).set({ cadence: on.length ? c : { ...c, perWeek: 0, days: [] }, updatedAt: new Date() }).where(eq(profiles.userId, userId));
}

/** Slots in use for approved posts, in the user's time zone. */
export async function postingSlots(tx: Tx, userId: string) {
  const rows = await ensurePosting(tx, userId);
  return rows.filter((r) => r.mode !== "off").map((r) => ({ time: r.localTime, days: r.days }));
}

const familyMode = (rows: Row[]) => (rows.find((r) => r.mode !== "off")?.mode ?? "shadow") as Row["mode"];
const view = (r: Row) => ({ key: r.key, family: r.family, slot: r.slot, time: r.localTime, days: r.days, mode: r.mode, executor: r.executor, note: r.note, updatedAt: r.updatedAt.toISOString() });
export type ScheduleView = ReturnType<typeof view>;

export async function getPlan(userId: string) {
  return asUser(userId, async (tx) => {
    await ensurePosting(tx, userId);
    const rows = (await tx.select().from(schedules)).sort((a, b) => a.localTime.localeCompare(b.localTime));
    const vol = await volumeOf(tx, userId), tz = (await cadenceOf(tx, userId)).tz;
    const posting = rows.filter((r) => r.family === "posting").sort((a, b) => (a.slot ?? "").localeCompare(b.slot ?? ""));
    const engage = rows.filter((r) => r.family === "engage");
    const perDay = Math.max(0, ...[0, 1, 2, 3, 4, 5, 6].map((d) => engage.filter((r) => r.mode !== "off" && r.days[d] === "1").length));
    return {
      tz, volume: vol,
      posting: { perWeek: postsPerWeek(posting.map((r) => ({ key: r.key, slot: r.slot ?? "", days: r.days, mode: r.mode }))), rows: posting.map(view) },
      engage: { perDay, rows: engage.map(view) },
      other: rows.filter((r) => r.family !== "posting" && r.family !== "engage").map(view),
      holds: (await tx.select().from(holds)).map((h) => ({ name: h.name, reason: h.reason, setAt: h.setAt.toISOString() })),
    };
  });
}
export type Plan = Awaited<ReturnType<typeof getPlan>>;

export const postingInput = z.object({ perWeek: z.number().int().min(0).max(PLANNER.postsPerWeekMax), slotOrder: z.array(z.enum(SLOTS)).length(3).optional(), dryRun: z.boolean().optional() });
export const engageInput = z.object({
  perDay: z.number().int().min(0).max(PLANNER.commentsPerDayMax), redistribute: z.boolean().optional(), dryRun: z.boolean().optional(),
  window: z.tuple([z.string().regex(TIME), z.string().regex(TIME)]).optional(), minGap: z.number().int().optional(),
});

/** Posts a week: one more turns on the best (slot, day) still off; one fewer turns off the worst one on. */
export async function setPosting(userId: string, input: z.infer<typeof postingInput>): Promise<PostingPlan> {
  return asUser(userId, async (tx) => {
    const rows = await ensurePosting(tx, userId), vol = await volumeOf(tx, userId);
    const order = input.slotOrder ?? vol.posting.slot_order;
    const plan = planPosting(rows.map((r) => ({ key: r.key, slot: r.slot ?? "", days: r.days, mode: r.mode })), input.perWeek, order);
    if ("error" in plan) throw new ServiceError("invalid", plan.error);
    if (input.dryRun) return plan;
    for (const r of plan.rows) {
      await tx.update(schedules).set({ days: r.days, ...(r.mode_off ? { mode: "off" as const } : r.mode_on ? { mode: "live" as const } : {}), updatedAt: new Date() })
        .where(eq(schedules.key, r.key));
    }
    if (input.slotOrder) await saveVolume(tx, userId, { ...vol, posting: { slot_order: input.slotOrder } });
    await syncCadence(tx, userId);
    return plan;
  });
}

/** Comments a day: one more goes in the widest gap, one fewer comes out of the most crowded spot. */
export async function setEngage(userId: string, input: z.infer<typeof engageInput>): Promise<EngagePlan> {
  return asUser(userId, async (tx) => {
    const vol = await volumeOf(tx, userId);
    const prefs: EngagePrefs = { window: input.window ?? vol.engage.window, min_gap: input.minGap ?? vol.engage.min_gap };
    const bad = checkEngagePrefs(prefs);
    if (bad) throw new ServiceError("invalid", bad);
    const rows = await tx.select().from(schedules).where(eq(schedules.family, "engage"));
    // A first plan (nothing running yet) is spaced evenly; after that, one more or one fewer moves nothing else.
    const fresh = !rows.some((r) => r.mode !== "off");
    const plan = planEngage(rows.map((r) => ({ key: r.key, local_time: r.localTime, mode: r.mode })), input.perDay, prefs, { redistribute: input.redistribute || fresh });
    if ("error" in plan) throw new ServiceError("invalid", plan.error);
    if (input.dryRun) return plan;
    const mode = familyMode(rows), now = new Date();
    for (const o of plan.on) {
      if (o.created) await tx.insert(schedules).values({ userId, key: o.key, family: "engage", localTime: o.local_time, days: "1111111", mode, executor: "runner" });
      else await tx.update(schedules).set({ localTime: o.local_time, mode, updatedAt: now }).where(eq(schedules.key, o.key));
    }
    for (const k of plan.off) await tx.update(schedules).set({ mode: "off", updatedAt: now }).where(eq(schedules.key, k));
    for (const m of plan.moved) await tx.update(schedules).set({ localTime: m.local_time, updatedAt: now }).where(eq(schedules.key, m.key));
    if (input.window || input.minGap) await saveVolume(tx, userId, { ...vol, engage: prefs });
    return plan;
  });
}

async function saveVolume(tx: Tx, userId: string, v: Volume) {
  await tx.insert(engineSettings).values({ userId, volume: v }).onConflictDoUpdate({ target: engineSettings.userId, set: { volume: v, updatedAt: new Date() } });
}

export const schedulePatch = z.object({
  time: z.string().regex(TIME, "Use a time like 09:00.").optional(),
  days: z.string().regex(/^[01]{7}$/).optional(),
  mode: z.enum(["off", "shadow", "live"]).optional(),
  note: z.string().trim().max(300).optional(),
});

/** One row: a dragged time, a day toggled, a mode. Posting rows are live or off; nothing goes in quiet hours. */
export async function updateSchedule(userId: string, key: string, patch: z.infer<typeof schedulePatch>) {
  return asUser(userId, async (tx) => {
    await ensurePosting(tx, userId);
    const [r] = await tx.select().from(schedules).where(eq(schedules.key, key));
    if (!r) throw new ServiceError("not_found", "No such schedule.");
    if (patch.time && r.family !== "posting") {
      const m = toMin(patch.time);
      if (m >= QUIET_START || m < QUIET_END) throw new ServiceError("invalid", `Nothing runs between ${PLANNER.quietHours[0]} and ${PLANNER.quietHours[1]}.`);
    }
    if (patch.mode === "shadow" && r.family === "posting") throw new ServiceError("invalid", "A posting slot is on or off; drafts wait for your approval either way.");
    if (patch.days === "0000000" && (patch.mode ?? r.mode) !== "off") throw new ServiceError("invalid", "Pick at least one day, or switch it off.");
    const [out] = await tx.update(schedules).set({
      ...(patch.time ? { localTime: patch.time } : {}), ...(patch.days ? { days: patch.days } : {}),
      ...(patch.mode ? { mode: patch.mode } : {}), ...(patch.note !== undefined ? { note: patch.note || null } : {}), updatedAt: new Date(),
    }).where(eq(schedules.key, key)).returning();
    if (r.family === "posting") await syncCadence(tx, userId);
    return view(out);
  });
}

/** Setup changed the posting rhythm: slot A takes it; the other slots switch off. */
export async function resetPostingFromCadence(userId: string) {
  await asUser(userId, async (tx) => {
    const c = await cadenceOf(tx, userId), mask = maskFromCadence(c);
    const rows = await ensurePosting(tx, userId);
    for (const r of rows) {
      const a = r.slot === "A";
      await tx.update(schedules).set({ ...(a ? { localTime: c.time, days: mask.includes("1") ? mask : r.days, mode: mask.includes("1") ? "live" as const : "off" as const } : { mode: "off" as const }), updatedAt: new Date() })
        .where(eq(schedules.key, r.key));
    }
  });
}

export async function setHold(userId: string, name: HoldName, reason?: string) {
  await asUser(userId, (tx) => tx.insert(holds).values({ userId, name, reason: reason?.trim() || null }).onConflictDoNothing());
}
export async function clearHold(userId: string, name: HoldName) {
  await asUser(userId, (tx) => tx.delete(holds).where(and(eq(holds.userId, userId), eq(holds.name, name))));
}
/** Publishing is paused while the `all` hold is set. */
export async function isPaused(tx: Tx): Promise<boolean> {
  return (await tx.select({ n: holds.name }).from(holds).where(eq(holds.name, "all")).limit(1)).length > 0;
}
