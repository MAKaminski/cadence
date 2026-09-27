import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { asUser, db } from "@/db";
import { llmUsage, platformAccounts, profiles, subscription, user } from "@/db/schema";
import { LIMITS } from "@/lib/catalog";

/** Trialing or active subscription. */
export async function hasSubscription(userId: string) {
  const [row] = await db.select({ status: subscription.status }).from(subscription)
    .where(and(eq(subscription.referenceId, userId), inArray(subscription.status, ["trialing", "active"]))).limit(1);
  return Boolean(row);
}

export type Me = {
  id: string; name: string; email: string | null;
  subscription: { status: string; trialEnd: string | null; periodEnd: string | null } | null;
  setupComplete: boolean; model: string | null;
  modelUseThisMonthUsd: number; modelAllowanceUsd: number;
  linkedin: { status: string; expiresAt: string | null } | null;
};

export async function me(userId: string): Promise<Me> {
  const [u] = await db.select({ id: user.id, name: user.name, email: user.email, anon: user.isAnonymous }).from(user).where(eq(user.id, userId));
  const [sub] = await db.select().from(subscription).where(eq(subscription.referenceId, userId)).limit(1);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const r = await asUser(userId, async (tx) => ({
    p: (await tx.select({ step: profiles.onboardingStep, model: profiles.model }).from(profiles).where(eq(profiles.userId, userId)))[0],
    spent: Number((await tx.select({ usd: sql<string>`coalesce(sum(${llmUsage.costUsd}),0)` }).from(llmUsage).where(gte(llmUsage.createdAt, monthStart)))[0].usd),
    conn: (await tx.select().from(platformAccounts).where(eq(platformAccounts.platform, "linkedin")).limit(1))[0],
  }));
  return {
    id: u.id, name: u.name, email: u.anon ? null : u.email,
    subscription: sub ? { status: sub.status ?? "unknown", trialEnd: sub.trialEnd?.toISOString() ?? null, periodEnd: sub.periodEnd?.toISOString() ?? null } : null,
    setupComplete: (r.p?.step ?? 0) > 3, model: r.p?.model ?? null,
    modelUseThisMonthUsd: Math.round(r.spent * 100) / 100, modelAllowanceUsd: LIMITS.monthlyCapUsd,
    linkedin: r.conn ? { status: r.conn.status, expiresAt: r.conn.expiresAt?.toISOString() ?? null } : null,
  };
}

/**
 * Delete an account and everything in it, at the user's request (App Store guideline 5.1.1(v) and plain
 * decency). Order matters:
 *  1. cancel an active Stripe subscription immediately, so nobody is billed for a deleted account;
 *  2. delete the rows that point at the user without a foreign key (`subscription`, whose owner
 *     column is plugin-managed); `apikey` cascades through drizzle/0005, the rest through user FKs;
 *  3. delete the user, which removes the encrypted LinkedIn token (`account`), sessions, setup,
 *     drafts, publications, results, jobs, usage, devices, OAuth consents and tokens.
 * Tests assert no row for the user survives in any table.
 */
export async function deleteAccount(userId: string): Promise<{ cancelledStripe: number }> {
  const { stripeClient } = await import("@/lib/auth");
  const { isDemo } = await import("@/lib/mode");
  const subs = await db.select().from(subscription).where(eq(subscription.referenceId, userId));
  let cancelledStripe = 0;
  for (const s of subs) {
    if (!s.stripeSubscriptionId || !["trialing", "active", "past_due"].includes(s.status ?? "") || isDemo()) continue;
    await stripeClient.subscriptions.cancel(s.stripeSubscriptionId);
    cancelledStripe++;
  }
  await db.transaction(async (tx) => {
    await tx.delete(subscription).where(eq(subscription.referenceId, userId));
    await tx.delete(user).where(eq(user.id, userId));
  });
  return { cancelledStripe };
}
