import type { Metadata } from "next";
import { consistency, impact, outreach, RANGES, sinceOf, totals, whatWorks, type Range } from "@/services/stats";
import { requireSubscriber } from "@/lib/session";
import Link from "next/link";
import { asUser } from "@/db";
import { platformAccounts } from "@/db/schema";
import { isDemo } from "@/lib/mode";
import { PLATFORMS, spec } from "@/platforms/registry";
import { linkedinAnalytics } from "@/platforms/linkedin-analytics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImpactChart, OutreachChart, WhatWorksChart } from "./charts";
import { SeedButton } from "./seed-button";

export const metadata: Metadata = { title: "Results" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function Results({ searchParams }: { searchParams: Promise<{ channel?: string; range?: string }> }) {
  const user = await requireSubscriber();
  // One channel at a time: an X version is the same post, so mixing them would double the counts.
  const connected = await asUser(user.id, (tx) => tx.selectDistinct({ platform: platformAccounts.platform }).from(platformAccounts));
  const channels = PLATFORMS.filter((p) => p.id === "linkedin" || connected.some((c) => c.platform === p.id));
  const q = await searchParams;
  const channel = channels.find((p) => p.id === q.channel) ?? spec("linkedin");
  // Time frame: every chart and total below covers the same span.
  const range: Range = q.range && q.range in RANGES ? (q.range as Range) : "12w";
  const since = sinceOf(range);
  const span = RANGES[range].weeks ?? 52;
  const [weeks, c, posts, works, t] = await Promise.all([
    outreach(user.id, span, channel.id), consistency(user.id), impact(user.id, range === "4w" ? 30 : 150, channel.id, since), whatWorks(user.id, channel.id, since), totals(user.id, channel.id, since),
  ]);
  const href = (r: Range) => { const u = new URLSearchParams(); if (channel.id !== "linkedin") u.set("channel", channel.id); if (r !== "12w") u.set("range", r); const s = u.toString(); return `/app/results${s ? `?${s}` : ""}`; };
  const sample = posts.some((p) => p.sample);
  const thisWeek = weeks[weeks.length - 1];
  const waiting = <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
    {channel.id === "linkedin"
      ? (linkedinAnalytics()
        ? "No LinkedIn numbers yet. Each post's numbers are read 1, 3 and 7 days after it goes out. If none arrive, sign in with LinkedIn again so it can grant Cadence access to your post analytics."
        : "No LinkedIn numbers yet. LinkedIn doesn't share post analytics with Cadence yet, so add each post's numbers on Published (copy them from the post's View analytics page). They show up here straight away.")
      : `No ${channel.name} numbers yet. Each post's numbers appear here 1, 3 and 7 days after it goes out.`}
  </p>;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
          <p className="mt-1 text-muted-foreground">Outreach is what you put out. Impact is what it did.</p>
          {channels.length > 1 && (
            <nav aria-label="Channel" className="mt-3 flex gap-1">
              {channels.map((p) => (
                <Link key={p.id} href={p.id === "linkedin" ? `/app/results${range !== "12w" ? `?range=${range}` : ""}` : `/app/results?channel=${p.id}${range !== "12w" ? `&range=${range}` : ""}`} aria-current={p.id === channel.id ? "page" : undefined}
                  className={`rounded-md px-3 py-1 text-sm ${p.id === channel.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}>{p.name}</Link>
              ))}
            </nav>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {sample && <Badge variant="secondary">Demo: sample numbers</Badge>}
          {isDemo() && posts.length < 6 && <SeedButton />}
        </div>
      </div>

      <nav aria-label="Time frame" data-testid="ranges" className="flex flex-wrap gap-1">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={href(r)} aria-current={r === range ? "page" : undefined}
            className={`rounded-md border px-3 py-1 text-sm ${r === range ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>{RANGES[r].label}</Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-4" aria-label={`Totals, ${RANGES[range].label.toLowerCase()}`} data-testid="totals">
        <Stat label="Posts" value={t.posts.toLocaleString("en-US")} hint={`${t.withNumbers} with numbers`} />
        <Stat label="Impressions" value={t.impressions.toLocaleString("en-US")} hint={t.withNumbers ? `${Math.round(t.impressions / t.withNumbers).toLocaleString("en-US")} per post` : "no numbers yet"} />
        <Stat label="Engagement rate" value={t.rate == null ? "–" : `${(t.rate * 100).toFixed(2)}%`} hint={`${t.engagements.toLocaleString("en-US")} reactions, comments and reshares`} />
        <Stat label="Best post" value={t.best ? t.best.impressions.toLocaleString("en-US") : "–"} hint={t.best ? `impressions · ${t.best.excerpt.slice(0, 48)}${t.best.excerpt.length > 48 ? "…" : ""}` : "no numbers yet"} />
      </section>

      <section id="consistency" className="grid scroll-mt-6 gap-3 sm:grid-cols-4" aria-label="Consistency">
        <Stat label="This week" value={`${thisWeek.posts} / ${thisWeek.target}`} hint="posts published vs your target" />
        <Stat label="Weeks on target" value={c.streakWeeks} hint="in a row" />
        <Stat label="Approved this month" value={c.approved} hint={`${c.edited} edited · ${c.held} held · ${c.skipped} skipped`} />
        <Stat label="Check-in to post" value={c.medianHoursToPost == null ? "–" : `${c.medianHoursToPost} h`} hint="median" />
      </section>

      <Card id="outreach" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Outreach: posts per week</CardTitle>
          <CardDescription>How to read this: each bar is a week; solid bars met your target (the dashed line), faded bars fell short. Steady beats spiky on LinkedIn.</CardDescription>
        </CardHeader>
        <CardContent><OutreachChart data={weeks} /></CardContent>
      </Card>

      <Card id="impact" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Impact: reach and engagement per post</CardTitle>
          <CardDescription>How to read this: bars are impressions (how many saw it); the solid line is engagement rate (reactions, comments and reshares per impression); the dashed line smooths it over 4 posts. The darker bar is your best post.</CardDescription>
        </CardHeader>
        <CardContent>{posts.length ? <ImpactChart data={posts} /> : waiting}</CardContent>
      </Card>

      <Card id="what-works" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>What works for you</CardTitle>
          <CardDescription>How to read this: average engagement rate grouped three ways. Longer bars did better. With only a few posts, treat it as a hint, not a rule; Cadence will use it to steer drafts once there are enough.</CardDescription>
        </CardHeader>
        <CardContent>{works.length ? <WhatWorksChart data={works} /> : waiting}</CardContent>
      </Card>
    </div>
  );
}
