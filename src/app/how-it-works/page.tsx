import type { Metadata } from "next";
import Link from "next/link";
import { COMING, LIMITS, ROUTINES, SETUP, WEEKLY } from "@/lib/catalog";
import { FAQ, SITE } from "@/lib/site";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Adjustments, CountsStrip, ItemList } from "@/components/catalog-view";
import { JsonLd } from "@/components/json-ld";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How Cadence works",
  description: "Every setting, weekly action and automatic routine in Cadence, and exactly how it decides to fix, rewrite or hold a LinkedIn draft.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorks() {
  return (
    <>
      <SiteHeader />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-16">
        <header className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">How Cadence works</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            No hidden automation. Here is everything you can set, everything you do, and everything Cadence does on its own,
            with the exact rules it uses to change a draft. The app uses these same numbers.
          </p>
          <CountsStrip />
        </header>

        <section className="flex flex-col gap-4" id="setup">
          <h2 className="text-2xl font-semibold tracking-tight">Set once, about 8 minutes</h2>
          <ItemList items={SETUP} />
        </section>
        <section className="flex flex-col gap-4" id="weekly">
          <h2 className="text-2xl font-semibold tracking-tight">Each week, about 2 minutes</h2>
          <ItemList items={WEEKLY} />
        </section>
        <section className="flex flex-col gap-4" id="routines">
          <h2 className="text-2xl font-semibold tracking-tight">What runs for you</h2>
          <ItemList items={ROUTINES} />
        </section>

        <section className="flex flex-col gap-4" id="adjustments">
          <h2 className="text-2xl font-semibold tracking-tight">How a draft gets adjusted</h2>
          <p className="max-w-3xl text-muted-foreground">
            Cadence writes {LIMITS.variants} versions of each post and keeps the one that passes the most checks. Then every draft goes
            through the same checks, in this order. Open "Why this draft" on any draft to see which applied to it.
          </p>
          <Adjustments />
        </section>

        <section className="flex flex-col gap-4" id="coming">
          <h2 className="text-2xl font-semibold tracking-tight">Coming next</h2>
          <ItemList items={COMING} />
          <p className="text-muted-foreground">
            Want something else? <a className="underline" href={SITE.ideas}>Suggest it on GitHub</a>: every setting above started as a question like yours.
          </p>
        </section>

        <section className="flex flex-col gap-4" id="faq">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <div className="flex flex-col divide-y rounded-xl border">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="mt-2 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Button size="lg" render={<Link href="/login" />}>Start your {SITE.trialDays}-day free trial</Button>
          <Button size="lg" variant="outline" render={<Link href="/demo" />}>Watch the demo</Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
