import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, metrics, profiles, publications } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Published" };

export default async function Published() {
  const user = await requireSubscriber();
  const { rows, latest, tz } = await asUser(user.id, async (tx) => ({
    rows: await tx.select({ id: publications.id, status: publications.status, externalId: publications.externalPostId, at: publications.publishedAt, created: publications.createdAt, body: drafts.body })
      .from(publications).innerJoin(drafts, eq(drafts.id, publications.draftId)).orderBy(desc(publications.createdAt)).limit(50),
    latest: await tx.selectDistinctOn([metrics.publicationId]).from(metrics).orderBy(metrics.publicationId, desc(metrics.capturedAt)),
    tz: ((await tx.select({ c: profiles.cadence }).from(profiles).where(eq(profiles.userId, user.id)))[0]?.c as { tz?: string })?.tz ?? "UTC",
  }));
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
        <p className="mt-1 text-muted-foreground">
          Everything Cadence has posted for you, with each post's latest numbers. Trends are on <a className="underline" href="/app/results">Results</a>.
        </p>
      </div>
      {rows.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Nothing published yet. Approved posts appear here after their slot.</p>}
      {rows.map((r) => {
        const m = latest.find((x) => x.publicationId === r.id);
        const isSample = Boolean((m?.platformData as { sample?: boolean } | undefined)?.sample);
        const real = r.externalId && !r.externalId.includes("demo");
        return (
          <Card key={r.id} data-testid="publication">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
              {r.status === "published" && <Badge>Published</Badge>}
              {r.status === "needs_review" && <Badge variant="destructive">Check LinkedIn</Badge>}
              {r.status === "failed" && <Badge variant="destructive">Not posted</Badge>}
              {r.status === "publishing" && <Badge variant="secondary">Posting…</Badge>}
              <span className="text-sm text-muted-foreground">{fmt(r.at ?? r.created)}</span>
              {real && <a className="ml-auto text-sm underline" href={`https://www.linkedin.com/feed/update/${r.externalId}/`} target="_blank" rel="noreferrer">View on LinkedIn</a>}
              {!real && r.externalId && <span className="ml-auto font-mono text-xs text-muted-foreground">{r.externalId}</span>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
              {r.status === "needs_review" && <p className="text-sm text-red-700">Cadence lost contact while posting, so it may or may not be live. Check your LinkedIn activity; Cadence will not try again on its own.</p>}
              {m && (
                <dl className="grid grid-cols-4 gap-2 rounded-lg bg-muted p-3 text-center text-sm" aria-label={isSample ? "Sample results" : "Results"}>
                  {([["Impressions", m.impressions], ["Reactions", m.reactions], ["Comments", m.comments], ["Reshares", m.reshares]] as const).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{(v ?? 0).toLocaleString()}</dd></div>)}
                  {isSample && <p className="col-span-4 text-xs text-muted-foreground">Sample numbers (demo mode)</p>}
                </dl>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
