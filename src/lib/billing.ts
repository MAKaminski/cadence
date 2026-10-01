// Prices and the annual offer. Pure, so the math is unit-tested and the page only formats it.

/** The plan's list price. Stripe's own price is shown when it can be read (see services/billing.ts). */
export const MONTHLY_PRICE_CENTS = 2000;
/** Annual billing costs 12 months at this discount. */
export const ANNUAL_DISCOUNT = 0.2;

export type AnnualQuote = { monthlyCents: number; fullYearCents: number; annualCents: number; savingCents: number; percentOff: number };

/** What a year costs billed monthly, what it costs billed annually, and the difference. `annualCents`
 *  is Stripe's actual yearly price when known, so the saving shown is the saving charged. */
export function annualQuote(monthlyCents: number, annualCents = Math.round(12 * monthlyCents * (1 - ANNUAL_DISCOUNT))): AnnualQuote {
  const fullYearCents = 12 * monthlyCents;
  const savingCents = Math.max(0, fullYearCents - annualCents);
  return { monthlyCents, fullYearCents, annualCents, savingCents, percentOff: fullYearCents ? Math.round((100 * savingCents) / fullYearCents) : 0 };
}

/** $20, $192, $19.50: whole dollars without cents. */
export function usd(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString("en-US") : d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
