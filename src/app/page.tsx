import Link from "next/link";
import { Check, ShieldCheck, CalendarClock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const steps = [
  { icon: PenLine, title: "Tell it who you are, once", body: "Your role, your audience, three posts you've written, and the facts you're happy to see in print. About eight minutes." },
  { icon: CalendarClock, title: "Check in each week", body: "Two minutes: what happened, what you're working on, any links worth sharing. Cadence drafts posts from it in your voice." },
  { icon: ShieldCheck, title: "Approve, and it posts", body: "Edit, approve or skip each draft. Approved posts go out on LinkedIn at the times you picked." },
];

const promises = [
  "Nothing posts without your approval unless you switch that on.",
  "It only states facts you gave it. No invented numbers or employers.",
  "It posts through LinkedIn's official API. It never logs in as you or clicks around your account.",
  "Cancel anytime from Settings.",
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-14 sm:pt-24">
          <p className="text-sm font-medium text-primary">For people who mean to post on LinkedIn and don't</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            LinkedIn posts in your own voice, from two minutes a week.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Cadence turns a short weekly check-in into posts that sound like you, checks them against your own facts,
            and publishes the ones you approve.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/login" />}>Start your 7-day free trial</Button>
            <span className="text-sm text-muted-foreground">$20 a month after the trial. Cancel anytime.</span>
          </div>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <s.icon className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <p className="text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What it won't do</h2>
            <ul className="mt-5 flex flex-col gap-3">
              {promises.map((p) => (
                <li key={p} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /><span>{p}</span></li>
              ))}
            </ul>
          </div>
          <div id="pricing" className="rounded-xl border p-6">
            <p className="text-sm font-medium text-muted-foreground">One plan</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">$20<span className="text-lg font-normal text-muted-foreground"> / month</span></p>
            <p className="mt-2 text-muted-foreground">7 days free. Your card is only charged when the trial ends.</p>
            <ul className="mt-5 flex flex-col gap-2 text-sm">
              <li>Up to 5 posts a week on LinkedIn</li>
              <li>Drafts in your voice, checked against your facts</li>
              <li>Choose the writing model: Claude Sonnet 5 or Claude Opus 5</li>
            </ul>
            <Button className="mt-6 w-full" size="lg" render={<Link href="/login" />}>Start free trial</Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
