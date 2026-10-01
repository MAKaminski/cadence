"use server";
// Demo-only server actions. Every one re-checks requireDemo() at request time.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
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
