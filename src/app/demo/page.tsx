import type { Metadata } from "next";
import Link from "next/link";
import { existsSync } from "node:fs";
import path from "node:path";
import chapters from "../../../public/demo/chapters.json";
import { COUNTS } from "@/lib/catalog";
import { SITE } from "@/lib/site";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { JsonLd } from "@/components/json-ld";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Demo: a full Cadence trial in two minutes",
  description: "Watch a full Cadence trial recorded from the app: sign-up, setup, a weekly check-in, drafts with the reasons behind every change, approval and publishing.",
  alternates: { canonical: "/demo" },
};

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export default function Demo() {
  const hasVideo = existsSync(path.join(process.cwd(), "public/demo/cadence-demo.mp4"));
  const list = chapters as { t: number; title: string }[];
  return (
    <>
      <SiteHeader />
      {hasVideo && <JsonLd data={{
        "@context": "https://schema.org", "@type": "VideoObject", name: "Cadence demo: a full trial", description: metadata.description,
        thumbnailUrl: `${SITE.url}/demo/poster.png`, contentUrl: `${SITE.url}/demo/cadence-demo.mp4`, uploadDate: "2026-09-27",
      }} />}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">See a full trial</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Recorded from the app itself in demo mode, where sign-in, checkout, the AI writer and LinkedIn are replaced by local
            stand-ins. The screens, checks and scheduling are the real ones. You'll see all {COUNTS.setup} settings, the weekly
            check-in, and why each draft reads the way it does.
          </p>
        </header>
        {hasVideo ? (
          <video controls playsInline preload="metadata" poster="/demo/poster.png" className="w-full rounded-xl border shadow-sm">
            <source src="/demo/cadence-demo.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/cadence-demo.vtt" srcLang="en" label="English" default />
          </video>
        ) : <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">The demo video is being recorded.</p>}
        {list.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">Chapters</h2>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {list.map((c) => <li key={c.t} className="flex gap-3 text-sm"><span className="w-10 shrink-0 font-mono text-muted-foreground">{fmt(c.t)}</span>{c.title}</li>)}
            </ol>
          </section>
        )}
        <section className="rounded-xl border p-6">
          <h2 className="text-xl font-semibold">Run it yourself</h2>
          <p className="mt-2 text-muted-foreground">The same demo runs on your machine with no keys: Postgres and one command.</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm">git clone {SITE.repo}{"\n"}cd cadence && pnpm install && pnpm demo</pre>
        </section>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" render={<Link href="/login" />}>Start your {SITE.trialDays}-day free trial</Button>
          <Button size="lg" variant="outline" render={<Link href="/how-it-works" />}>How it works</Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
