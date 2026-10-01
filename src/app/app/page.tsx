import type { Metadata } from "next";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Loader2 } from "lucide-react";
import { asUser } from "@/db";
import { drafts, inputs, jobs, llmUsage, platformAccounts, profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { LIMITS } from "@/lib/catalog";
import type { GateRecord } from "@/engine/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckinForm } from "./checkin-form";
import { DraftCard } from "./draft-card";
import { AutoRefresh } from "./auto-refresh";
import { consistency, outreach } from "@/services/stats";
import Link from "next/link";
import { isDemo } from "@/lib/mode";
import { PERSONA } from "@/lib/demo-persona";
import { ConnectLinkedIn } from "@/components/connect-linkedin";
import { linkedinConfigured } from "@/lib/linkedin-config";
import { InputsLink } from "@/components/inputs-link";

export const metadata: Metadata = { title: "This week" };

export default async function ThisWeek() {
  const user = await requireSubscriber();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const data = await asUser(user.id, async (tx) => ({
    profile: (await tx.select({ cadence: profiles.cadence }).from(profiles).where(eq(profiles.userId, user.id)))[0],
    checkins: await tx.select({ id: inputs.id }).from(inputs).orderBy(desc(inputs.createdAt)).limit(1),
    list: await tx.select().from(drafts).where(inArray(drafts.status, ["draft", "held", "scheduled", "failed"])).orderBy(desc(drafts.createdAt)).limit(20),
    busy: await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.kind, "draft"), inArray(jobs.status, ["queued", "running"]))).limit(1),
    publishing: await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.kind, "publish"), inArray(jobs.status, ["queued", "running"]), sql`${jobs.runAt} <= now() + interval '1 minute'`)).limit(1),
    lastFailed: (await tx.select({ error: jobs.lastError, status: jobs.status }).from(jobs).where(eq(jobs.kind, "draft")).orderBy(desc(jobs.createdAt)).limit(1))[0],
    spent: Number((await tx.select({ usd: sql<string>`coalesce(sum(${llmUsage.costUsd}),0)` }).from(llmUsage).where(gte(llmUsage.createdAt, monthStart)))[0].usd),
    connected: (await tx.select({ id: platformAccounts.id }).from(platformAccounts)
      .where(and(eq(platformAccounts.platform, "linkedin"), eq(platformAccounts.status, "active"))).limit(1)).length > 0,
    expiresSoon: (await tx.select({ id: platformAccounts.id }).from(platformAccounts)
      .where(and(eq(platformAccounts.platform, "linkedin"), sql`${platformAccounts.expiresAt} < now() + interval '7 days'`)).limit(1)).length > 0,
  }));
  const [weeks, streak] = await Promise.all([outreach(user.id, 1), consistency(user.id)]);
  const tz = (data.profile?.cadence as { tz?: string })?.tz ?? "UTC";
  const order = { held: 0, draft: 1, scheduled: 2, failed: 3 } as Record<string, number>;
  const list = [...data.list].sort((a, b) => order[a.status] - order[b.status]);
  const drafting = data.busy.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh active={drafting || data.publishing.length > 0} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
        <p className="mt-1 text-muted-foreground">Two minutes of notes in; drafts in your voice out. Nothing posts until you approve it.</p>
        <p className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border px-3 py-1 text-sm" data-testid="week-summary">
          <span><span className="font-semibold tabular-nums">{weeks[0].posts} of {weeks[0].target}</span> posts this week</span>
          <span className="text-muted-foreground">·</span>
          <span><span className="font-semibold tabular-nums">{streak.streakWeeks}</span> week streak</span>
          <Link href="/app/results" className="text-primary underline-offset-4 hover:underline">See results</Link>
        </p>
        <p className="mt-2"><InputsLink page="/app" /></p>
      </div>

      {!data.connected && !isDemo() && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm" data-testid="connect-linkedin">
        {linkedinConfigured() ? <><p>Connect LinkedIn to publish what you approve. Drafting works without it.</p><ConnectLinkedIn back="/app" variant="default" /></>
          : <p>Publishing to LinkedIn isn't set up on this server yet. Drafting works; nothing can be published until it is.</p>}</div>}
      {data.connected && data.expiresSoon && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p>Your LinkedIn connection ends soon. Renew it to keep posting.</p>{linkedinConfigured() && <ConnectLinkedIn label="Renew" back="/app" />}</div>}
      {data.spent >= LIMITS.monthlyCapUsd && <p className="rounded-lg border p-3 text-sm">This month's drafting allowance is used up (${LIMITS.monthlyCapUsd}). Scheduled posts still go out; new drafts resume on the 1st.</p>}
      {data.lastFailed?.status === "failed" && data.lastFailed.error && !drafting && <p className="rounded-lg border border-red-300 p-3 text-sm text-red-700">Drafting stopped: {data.lastFailed.error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Check in</CardTitle>
          <CardDescription>Rough notes are fine. Cadence only uses what you write here and the facts from your setup.</CardDescription>
        </CardHeader>
        <CardContent><CheckinForm example={isDemo() ? PERSONA.checkin : undefined} /></CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-live="polite">
        <h2 className="text-lg font-semibold">Drafts</h2>
        {drafting && <p className="flex items-center gap-2 rounded-lg border p-4 text-sm" data-testid="drafting"><Loader2 className="size-4 animate-spin" aria-hidden />Writing drafts from your check-in and checking each one…</p>}
        {!drafting && list.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            {data.checkins.length ? "No drafts waiting. Check in again whenever you have something new." : "No drafts yet. Save a check-in above to get your first ones."}
          </p>
        )}
        {byPost(list).map((d) => (
          <DraftCard key={`${d.id}-${d.version}-${d.status}`} d={{ id: d.id, platform: d.platform, body: d.body, status: d.status, version: d.version, scheduledFor: d.scheduledFor?.toISOString() ?? null, gate: d.gate as GateRecord, tz }} />
        ))}
      </section>
    </div>
  );
}

/** Each channel version (X…) right after the LinkedIn draft it was written from. */
function byPost<T extends { id: string; gate: unknown }>(list: T[]): T[] {
  const from = (d: T) => (d.gate as GateRecord).adaptedFrom;
  const roots = list.filter((d) => !from(d) || !list.some((p) => p.id === from(d)));
  return roots.flatMap((r) => [r, ...list.filter((d) => from(d) === r.id)]);
}
