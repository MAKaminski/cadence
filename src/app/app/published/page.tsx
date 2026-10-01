import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { listPublications } from "@/services/publications";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { linkedinAnalytics } from "@/platforms/linkedin-analytics";
import { NumbersForm } from "./numbers-form";

export const metadata: Metadata = { title: "Published" };

export default async function Published() {
  const user = await requireSubscriber();
  const rows = await listPublications(user.id);
  const tz = await asUser(user.id, async (tx) => ((await tx.select({ c: profiles.cadence }).from(profiles).where(eq(profiles.userId, user.id)))[0]?.c as { tz?: string })?.tz ?? "UTC");
  const auto = linkedinAnalytics();
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
        <p className="mt-1 text-muted-foreground">
          Everything Cadence has posted for you, with each post's latest numbers. Trends are on <a className="underline" href="/app/results">Results</a>.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {auto ? "LinkedIn numbers are read automatically 1, 3 and 7 days after a post goes out. You can also add them by hand."
            : "LinkedIn doesn't share post numbers with Cadence yet, so add them by hand from each post's analytics. They feed Results the same way."}
        </p>
      </div>
      {rows.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Nothing published yet. Approved posts appear here after their slot.</p>}
      {rows.map((r) => {
        const m = r.latest;
        const isSample = Boolean(m?.sample);
        const real = Boolean(r.url);
        return (
          <Card key={r.id} data-testid="publication">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
              {r.status === "published" && <Badge>Published</Badge>}
              {r.status === "needs_review" && <Badge variant="destructive">Check LinkedIn</Badge>}
              {r.status === "failed" && <Badge variant="destructive">Not posted</Badge>}
              {r.status === "publishing" && <Badge variant="secondary">Posting…</Badge>}
              <span className="text-sm text-muted-foreground">{fmt(r.publishedAt ? new Date(r.publishedAt) : r.createdAt)}</span>
              {real && <a className="ml-auto text-sm underline" href={r.url!} target="_blank" rel="noreferrer">View on LinkedIn</a>}
              {!real && r.externalId && <span className="ml-auto font-mono text-xs text-muted-foreground">{r.externalId}</span>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
              {r.status === "needs_review" && <p className="text-sm text-red-700">Cadence lost contact while posting, so it may or may not be live. Check your LinkedIn activity; Cadence will not try again on its own.</p>}
              {m && (
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-center text-sm sm:grid-cols-5" aria-label={isSample ? "Sample results" : "Results"}>
                  {([["Impressions", m.impressions], ["Members reached", m.details.membersReached], ["Reactions", m.reactions], ["Comments", m.comments], ["Reposts", m.reshares]] as const)
                    .filter(([k, v]) => k !== "Members reached" || v != null)
                    .map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{(v ?? 0).toLocaleString()}</dd></div>)}
                  {([["Saves", m.details.saves], ["Sends", m.details.sends], ["Link clicks", m.details.linkClicks], ["Followers gained", m.details.followersGained], ["Profile views", m.details.profileViews]] as const)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{v!.toLocaleString()}</dd></div>)}
                  <p className="col-span-full text-xs text-muted-foreground">
                    {isSample ? "Sample numbers (demo mode)" : `${m.source === "manual" ? "Entered by you" : `From ${r.platform === "x" ? "X" : "LinkedIn"}`}, ${fmt(new Date(m.capturedAt))}`}
                  </p>
                </dl>
              )}
              {r.status === "published" && r.platform === "linkedin" && (!auto || !m) && (
                <details className="rounded-lg border p-3" open={!m && !auto}>
                  <summary className="cursor-pointer text-sm font-medium">{m ? "Update numbers" : "Add numbers from LinkedIn"}</summary>
                  <div className="mt-3">
                    <NumbersForm publicationId={r.id} analyticsUrl={r.url} initial={{ impressions: m?.impressions, reactions: m?.reactions, comments: m?.comments, reshares: m?.reshares, ...m?.details }} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
