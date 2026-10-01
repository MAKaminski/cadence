// Reminders are ordinary jobs. An hourly sweep makes sure the next ones exist (the unique key on
// user/kind/ref/run_at makes that idempotent); each job decides at run time whether to send.
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { asWorker } from "@/db";
import { inputs, jobs, platformAccounts, profiles, user } from "@/db/schema";
import { zoned, type Cadence } from "@/engine/schedule";
import { sendEmail } from "@/lib/email";
import { push } from "@/lib/push";
import { IMPORT } from "@/lib/catalog";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const APP_URL = () => process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** 17:00 local on the day before the user's first posting day of next posting week. */
export function checkinReminderAt(c: Cadence, now: Date): Date | null {
  const first = [...c.days].sort((a, b) => ((DAY.indexOf(a) + 6) % 7) - ((DAY.indexOf(b) + 6) % 7))[0];
  if (!first) return null;
  for (let i = 0; i < 14; i++) {
    const day = new Date(now.getTime() + i * 86_400_000);
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: c.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(day).split("-").map(Number);
    const next = new Date(Date.UTC(local[0], local[1] - 1, local[2] + 1));
    if (DAY[next.getUTCDay()] !== first) continue;
    const at = zoned(local[0], local[1], local[2], 17, 0, c.tz);
    if (at > now) return at;
  }
  return null;
}

export async function sweep(now = new Date()) {
  await asWorker(async (tx) => {
    for (const p of await tx.select({ userId: profiles.userId, cadence: profiles.cadence }).from(profiles).where(gte(profiles.onboardingStep, 4))) {
      const at = checkinReminderAt(p.cadence as Cadence, now);
      if (!at) continue;
      const exists = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, p.userId), eq(jobs.kind, "remind_checkin"), eq(jobs.runAt, at))).limit(1);
      if (!exists.length) await tx.insert(jobs).values({ userId: p.userId, kind: "remind_checkin", runAt: at });
    }
    for (const a of await tx.select().from(platformAccounts).where(and(isNotNull(platformAccounts.expiresAt), eq(platformAccounts.status, "active")))) {
      for (const days of [7, 1]) {
        const at = new Date(a.expiresAt!.getTime() - days * 86_400_000);
        if (at > now) await tx.insert(jobs).values({ userId: a.userId, kind: "remind_expiry", refId: a.id, runAt: at }).onConflictDoNothing();
      }
    }
    await tx.execute(sql`update platform_accounts set status = 'expired' where status in ('active','expiring') and expires_at < now()`);
    // An import upload nobody finished: its chunks (up to 1 GB) go, with the row.
    await tx.execute(sql`delete from history_imports where status = 'uploading' and updated_at < now() - make_interval(hours => ${IMPORT.abandonHours})`);
  });
}

async function emailOf(userId: string) {
  return asWorker(async (tx) => (await tx.select({ email: user.email, anon: user.isAnonymous }).from(user).where(eq(user.id, userId)))[0]);
}

export async function remindCheckin(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 6 * 86_400_000);
  const recent = await asWorker((tx) => tx.select({ id: inputs.id }).from(inputs).where(and(eq(inputs.userId, userId), gte(inputs.createdAt, since))).limit(1));
  if (recent.length) return "skipped: already checked in";
  // Push first; email only when the user has no device.
  if (await push(userId, { kind: "checkin_reminder" })) return "pushed";
  const u = await emailOf(userId);
  if (!u || u.anon) return "skipped: no email";
  await sendEmail(u.email, "Two minutes for this week's posts?", `Your posting days start tomorrow. Jot down what you worked on, learned or noticed this week and Cadence will have drafts ready for you to approve.\n\n${APP_URL()}/app`);
  return "sent";
}

export async function remindExpiry(userId: string, accountId: string, now = new Date()) {
  const u = await emailOf(userId);
  const [a] = await asWorker((tx) => tx.select().from(platformAccounts).where(eq(platformAccounts.id, accountId)));
  if (!u || u.anon || !a?.expiresAt || a.expiresAt < now) return "skipped";
  const days = Math.max(1, Math.round((a.expiresAt.getTime() - now.getTime()) / 86_400_000));
  await asWorker((tx) => tx.update(platformAccounts).set({ status: "expiring" }).where(eq(platformAccounts.id, accountId)));
  if (await push(userId, { kind: "connection_expiring", days })) return "pushed";
  await sendEmail(u.email, `Your LinkedIn connection ends in ${days} day${days > 1 ? "s" : ""}`, `LinkedIn asks apps to reconnect about every 60 days. Sign in to Cadence with LinkedIn once to keep your scheduled posts going.\n\n${APP_URL()}/login`);
  return "sent";
}
