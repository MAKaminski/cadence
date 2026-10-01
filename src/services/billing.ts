// What Settings → Billing shows: the plan, its price and renewal date, and whether to offer annual billing.
// Prices come from Stripe (cached) so the page shows what Stripe charges; demo mode never calls Stripe.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { subscription } from "@/db/schema";
import { isDemo } from "@/lib/mode";
import { annualQuote, MONTHLY_PRICE_CENTS, type AnnualQuote } from "@/lib/billing";

/** Annual billing is offered only where its Stripe price is configured (always in demo mode). */
export const annualConfigured = () => isDemo() || /^price_/.test(process.env.STRIPE_ANNUAL_PRICE_ID ?? "");

export type Billing = {
  status: string; interval: "month" | "year"; priceCents: number; trialEndsAt: string | null; cancelAtPeriodEnd: boolean;
  /** The end of the current period: when it renews, or when it ends if cancelled. */
  periodEnd: string | null;
  /** Set when switching to annual is on offer: not already annual, not ending, and configured. */
  annual: AnnualQuote | null;
};

const cache = new Map<string, { cents: number | null; at: number }>();
const HOUR = 3_600_000;

/** A Stripe price's amount in cents, or null when it can't be read (the page falls back to the list price). */
async function stripeCents(priceId: string | undefined): Promise<number | null> {
  if (!priceId || isDemo()) return null;
  const hit = cache.get(priceId);
  if (hit && Date.now() - hit.at < HOUR) return hit.cents;
  let cents: number | null = null;
  try {
    const { stripeClient } = await import("@/lib/auth");
    cents = (await stripeClient.prices.retrieve(priceId)).unit_amount ?? null;
  } catch { /* shown at list price; retried next hour */ }
  cache.set(priceId, { cents, at: Date.now() });
  return cents;
}

export async function billingFor(userId: string): Promise<Billing | null> {
  const [s] = await db.select().from(subscription)
    .where(and(eq(subscription.referenceId, userId), inArray(subscription.status, ["trialing", "active", "past_due"])))
    .orderBy(desc(subscription.periodEnd)).limit(1);
  if (!s) return null;
  const monthly = (await stripeCents(process.env.STRIPE_PRICE_ID)) ?? MONTHLY_PRICE_CENTS;
  const yearly = (await stripeCents(process.env.STRIPE_ANNUAL_PRICE_ID)) ?? undefined;
  const quote = annualQuote(monthly, yearly);
  const interval = s.billingInterval === "year" ? "year" : "month";
  const ending = Boolean(s.cancelAtPeriodEnd || s.cancelAt);
  return {
    status: s.status, interval,
    priceCents: interval === "year" ? quote.annualCents : monthly,
    periodEnd: (s.periodEnd ?? s.trialEnd)?.toISOString() ?? null,
    trialEndsAt: s.status === "trialing" ? s.trialEnd?.toISOString() ?? null : null,
    cancelAtPeriodEnd: ending,
    annual: interval === "month" && !ending && annualConfigured() ? quote : null,
  };
}
