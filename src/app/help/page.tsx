import type { Metadata } from "next";
import Link from "next/link";
import { FAQ } from "@/lib/site";
import { HELP, HELP_GROUPS, videoOf } from "@/lib/help";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Help: demos and FAQs",
  description: "A short video of everything you can do in Cadence, with the steps and the questions people ask about each.",
  alternates: { canonical: "/help" },
};

// Open to everyone, signed in or not. Each video is recorded from the app itself in demo mode
// (pnpm help:record), so what you watch is what you get.
export default function Help() {
  const all = [...HELP.flatMap((t) => t.faqs), ...FAQ];
  return (
    <>
      <SiteHeader />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: all.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Help topics" className="lg:sticky lg:top-6 lg:self-start">
          {HELP_GROUPS.map((g) => (
            <div key={g.id} className="mb-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {HELP.filter((t) => t.group === g.id).map((t) => <li key={t.id}><a href={`#${t.id}`} className="hover:text-primary">{t.title}</a></li>)}
              </ul>
            </div>
          ))}
          <a href="#faq" className="text-sm font-medium hover:text-primary">More questions</a>
        </nav>

        <div className="flex min-w-0 flex-col gap-14">
          <header>
            <h1 className="text-4xl font-semibold tracking-tight">Help</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
              A short demo of everything you can do in Cadence, the steps, and the questions people ask. The videos are recorded from the app in demo mode.
            </p>
          </header>

          {HELP_GROUPS.map((g) => (
            <section key={g.id} aria-labelledby={`g-${g.id}`} className="flex flex-col gap-10">
              <h2 id={`g-${g.id}`} className="text-2xl font-semibold tracking-tight">{g.title}</h2>
              {HELP.filter((t) => t.group === g.id).map((t) => {
                const v = videoOf(t.id);
                return (
                  <article key={t.id} id={t.id} data-testid="help-topic" className="grid scroll-mt-6 gap-5 rounded-xl border p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <video controls preload="none" playsInline poster={v.poster} className="aspect-[8/5] w-full rounded-lg border bg-muted" aria-label={`Demo: ${t.title}`}>
                      <source src={v.src} type="video/mp4" />
                    </video>
                    <div className="flex flex-col gap-3">
                      <h3 className="text-lg font-semibold">{t.title}</h3>
                      <p className="text-sm text-muted-foreground">{t.summary}</p>
                      <ol className="list-decimal space-y-1 pl-5 text-sm">{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      <div className="flex flex-col gap-1">
                        {t.faqs.map((f) => (
                          <details key={f.q} className="rounded-md border px-3 py-2 text-sm">
                            <summary className="cursor-pointer font-medium">{f.q}</summary>
                            <p className="mt-1 text-muted-foreground">{f.a}</p>
                          </details>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}

          <section id="faq" aria-labelledby="faq-h" className="flex scroll-mt-6 flex-col gap-3">
            <h2 id="faq-h" className="text-2xl font-semibold tracking-tight">More questions</h2>
            {FAQ.map((f) => (
              <details key={f.q} className="rounded-md border px-4 py-3">
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
            <p className="text-sm text-muted-foreground">
              Still stuck? <Link href="/how-it-works" className="text-primary underline underline-offset-4">How it works</Link> has every rule, or{" "}
              <a href="https://github.com/MAKaminski/cadence/discussions" className="text-primary underline underline-offset-4">ask in Discussions</a>.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
