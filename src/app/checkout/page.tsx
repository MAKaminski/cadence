import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { PLAN, TRIAL_DAYS } from "@/lib/auth";
import { hasSubscription, requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-chrome";
import { StartTrial } from "./start-trial";
import { isDemo } from "@/lib/mode";

export const metadata: Metadata = { title: "Start your trial" };

export default async function CheckoutPage() {
  const user = await requireUser();
  if (await hasSubscription(user.id)) redirect("/onboarding");
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Welcome, {user.name.split(" ")[0] || "there"}</CardTitle>
            <CardDescription>Start your {TRIAL_DAYS}-day free trial. You won't be charged until it ends.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="rounded-lg border p-4">
              <p className="text-3xl font-semibold tracking-tight">$20<span className="text-base font-normal text-muted-foreground"> / month</span></p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {[`Free for ${TRIAL_DAYS} days, then $20 a month`, "Cancel anytime in Settings before the trial ends and pay nothing", "Card handled by Stripe; Cadence never sees it"].map((t) => (
                  <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{t}</li>
                ))}
              </ul>
            </div>
            {isDemo() && <p className="rounded-lg bg-muted p-3 text-sm">Demo mode: this stands in for the card step. No card is taken and nothing is charged.</p>}
            <StartTrial plan={PLAN} demo={isDemo()} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
