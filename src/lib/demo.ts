"use server";
// Demo-only server actions. Every one re-checks requireDemo() at request time.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { platformAccounts, subscription } from "@/db/schema";
import { asUser } from "@/db";
import { requireDemo } from "@/lib/mode";
import { requireUser } from "@/lib/session";
import { PLAN, TRIAL_DAYS } from "@/lib/auth";
import { addSampleHistory } from "@/services/sample-history";
import { SCENARIOS, type Scenario } from "@/lib/sample-scenarios";

/** Stands in for Stripe Checkout: a trialing subscription, no card, plus a demo LinkedIn connection. */
export async function startDemoTrial(): Promise<{ ok: true } | { ok: false; error: string }> {
  requireDemo();
  const user = await requireUser();
  const now = new Date(), end = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  await db.insert(subscription).values({
    id: randomUUID(), plan: PLAN, referenceId: user.id, status: "trialing",
    trialStart: now, trialEnd: end, periodStart: now, periodEnd: end, cancelAtPeriodEnd: false,
  });
  await asUser(user.id, (tx) => tx.insert(platformAccounts).values({
    userId: user.id, platform: "linkedin", externalId: "urn:li:person:demo", handle: "Demo account",
    expiresAt: new Date(now.getTime() + 60 * 86_400_000),
  }).onConflictDoNothing());
  revalidatePath("/checkout");
  return { ok: true };
}

/** Demo only: sample history for Results and Inputs, in one of the SCENARIOS. */
export async function seedDemoHistory(scenario: Scenario = "steady"): Promise<{ ok: true } | { ok: false; error: string }> {
  requireDemo();
  if (!SCENARIOS.some((s) => s.id === scenario)) return { ok: false, error: "Unknown sample history." };
  const user = await requireUser();
  await addSampleHistory(user.id, scenario);
  for (const p of ["/app/results", "/app/inputs", "/app", "/app/plan"]) revalidatePath(p);
  return { ok: true };
}

/** Stands in for Stripe's "switch to annual" confirmation: the subscription becomes yearly. A trial keeps
 *  its end date (the first yearly charge would fall then); a paid plan starts a new year today. */
export async function switchDemoToAnnual(): Promise<{ ok: true } | { ok: false; error: string }> {
  requireDemo();
  const user = await requireUser();
  const mine = and(eq(subscription.referenceId, user.id), inArray(subscription.status, ["trialing", "active"]));
  const [s] = await db.select().from(subscription).where(mine).limit(1);
  if (!s) return { ok: false, error: "There's no subscription to switch." };
  if (s.billingInterval === "year") return { ok: false, error: "You're already billed annually." };
  const now = new Date();
  await db.update(subscription).set(s.status === "trialing"
    ? { billingInterval: "year" }
    : { billingInterval: "year", periodStart: now, periodEnd: new Date(new Date(now).setFullYear(now.getFullYear() + 1)) })
    .where(eq(subscription.id, s.id));
  revalidatePath("/app/settings");
  return { ok: true };
}
