import type { Metadata } from "next";
import { consistency, impact, outreach, whatWorks } from "@/services/stats";
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

export default async function Results({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const user = await requireSubscriber();
  // One channel at a time: an X version is the same post, so mixing them would double the counts.
  const connected = await asUser(user.id, (tx) => tx.selectDistinct({ platform: platformAccounts.platform }).from(platformAccounts));
  const channels = PLATFORMS.filter((p) => p.id === "linkedin" || connected.some((c) => c.platform === p.id));
  const asked = (await searchParams).channel;
  const channel = channels.find((p) => p.id === asked) ?? spec("linkedin");
  const [weeks, c, posts, works] = await Promise.all([outreach(user.id, 12, channel.id), consistency(user.id), impact(user.id, 30, channel.id), whatWorks(user.id, channel.id)]);
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
                <Link key={p.id} href={p.id === "linkedin" ? "/app/results" : `/app/results?channel=${p.id}`} aria-current={p.id === channel.id ? "page" : undefined}
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

      <section className="grid gap-3 sm:grid-cols-4" aria-label="Consistency">
        <Stat label="This week" value={`${thisWeek.posts} / ${thisWeek.target}`} hint="posts published vs your target" />
        <Stat label="Weeks on target" value={c.streakWeeks} hint="in a row" />
        <Stat label="Approved this month" value={c.approved} hint={`${c.edited} edited · ${c.held} held · ${c.skipped} skipped`} />
        <Stat label="Check-in to post" value={c.medianHoursToPost == null ? "–" : `${c.medianHoursToPost} h`} hint="median" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Outreach: posts per week</CardTitle>
          <CardDescription>How to read this: each bar is a week; solid bars met your target (the dashed line), faded bars fell short. Steady beats spiky on LinkedIn.</CardDescription>
        </CardHeader>
        <CardContent><OutreachChart data={weeks} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impact: reach and engagement per post</CardTitle>
          <CardDescription>How to read this: bars are impressions (how many saw it); the solid line is engagement rate (reactions, comments and reshares per impression); the dashed line smooths it over 4 posts. The darker bar is your best post.</CardDescription>
        </CardHeader>
        <CardContent>{posts.length ? <ImpactChart data={posts} /> : waiting}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What works for you</CardTitle>
          <CardDescription>How to read this: average engagement rate grouped three ways. Longer bars did better. With only a few posts, treat it as a hint, not a rule; Cadence will use it to steer drafts once there are enough.</CardDescription>
        </CardHeader>
        <CardContent>{works.length ? <WhatWorksChart data={works} /> : waiting}</CardContent>
      </Card>
    </div>
  );
}
