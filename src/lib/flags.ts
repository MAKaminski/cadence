// Feature flags. A flag is off unless it is on for everyone or the person's email is on its allow
// list. Change them with `pnpm flag` (scripts/flag.mts); demo mode turns every flag on so the demo
// and CI exercise the real code.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { featureFlags, user as users } from "@/db/schema";
import { isDemo } from "./mode";

export const FLAGS = {
  examples: "Examples: add posts and visuals by URL or upload, rate them, and let the ratings steer drafting",
} as const;
export type Flag = keyof typeof FLAGS;

export function flagAllows(row: { enabledForAll: boolean; allowEmails: unknown } | undefined, email: string | null | undefined): boolean {
  if (!row) return false;
  if (row.enabledForAll) return true;
  const list = Array.isArray(row.allowEmails) ? (row.allowEmails as string[]) : [];
  return Boolean(email) && list.some((e) => e.toLowerCase() === email!.toLowerCase());
}

export async function flagOn(flag: Flag, user: { email?: string | null }): Promise<boolean> {
  if (isDemo()) return true;
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, flag));
  return flagAllows(row, user.email);
}

/** The same check from the worker, which knows only the user id. */
export async function flagOnFor(flag: Flag, userId: string): Promise<boolean> {
  if (isDemo()) return true;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return u ? flagOn(flag, u) : false;
}

/** Who may see the usage page: CADENCE_ADMINS (comma-separated emails). Everyone in demo mode. */
export function isAdmin(user: { email?: string | null }): boolean {
  if (isDemo()) return true;
  const admins = (process.env.CADENCE_ADMINS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(user.email) && admins.includes(user.email!.toLowerCase());
}
