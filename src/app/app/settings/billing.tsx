"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { switchDemoToAnnual } from "@/lib/demo";
import { usd } from "@/lib/billing";
import type { Billing as BillingT } from "@/services/billing";
import { BillingButton } from "./billing-button";

const PLAN = "cadence"; // the one plan in src/lib/auth.ts
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export function Billing({ billing: b, demo }: { billing: BillingT | null; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!b) return <div className="flex flex-col gap-3 text-sm"><p className="text-muted-foreground">No active plan.</p>{!demo && <div><BillingButton /></div>}</div>;

  const per = b.interval === "year" ? "year" : "month";
  const q = b.annual;
  const switchToAnnual = async () => {
    setBusy(true);
    if (demo) {
      const r = await switchDemoToAnnual();
      setBusy(false);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Switched to annual billing (demo: no charge).");
      router.refresh();
      return;
    }
    // Stripe's portal shows the prorated amount and asks to confirm, then returns here.
    const { error } = await authClient.subscription.upgrade({ plan: PLAN, annual: true, returnUrl: "/app/settings#billing" });
    if (error) { toast.error(error.message ?? "Couldn't start the switch. Try again."); setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1" data-testid="billing-summary">
        <dt className="text-muted-foreground">Plan</dt>
        <dd>Cadence, billed {b.interval === "year" ? "annually" : "monthly"}{b.status === "trialing" ? " (free trial)" : b.status === "past_due" ? " (payment due)" : ""}</dd>
        <dt className="text-muted-foreground">Price</dt>
        <dd>{usd(b.priceCents)} / {per}</dd>
        {b.periodEnd && <>
          <dt className="text-muted-foreground">{b.cancelAtPeriodEnd ? "Ends" : b.status === "trialing" ? "First charge" : "Renews"}</dt>
          <dd>{day(b.periodEnd)}{b.cancelAtPeriodEnd ? "" : ` at ${usd(b.priceCents)}`}</dd>
        </>}
      </dl>
      {q && (
        <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="annual-offer">
          <p className="font-medium">Switch to annual and save {q.percentOff}%</p>
          <p className="text-muted-foreground">
            {usd(q.monthlyCents)}/mo × 12 = {usd(q.fullYearCents)} a year. Billed annually: <span className="text-foreground">{usd(q.annualCents)}/yr</span>, saving {usd(q.savingCents)}.
            {b.status === "trialing" ? " Your trial stays free; the first yearly charge comes when it ends." : " Stripe shows the exact amount, less what's left of this month, before you confirm."}
          </p>
          <div><Button disabled={busy} onClick={switchToAnnual}>{busy ? "Switching…" : `Switch to annual — save ${q.percentOff}%`}</Button></div>
        </div>
      )}
      {demo ? <p className="text-muted-foreground">Demo mode: no card, no charges.</p> : <div><BillingButton /></div>}
    </div>
  );
}
