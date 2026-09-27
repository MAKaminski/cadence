import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, profiles, publications } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { isDemo } from "@/lib/mode";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Published" };

// Demo mode only: stable made-up numbers so the page shows what analytics will look like. Never stored.
function sample(id: string) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const impressions = 800 + (h % 4200);
  return { impressions, reactions: Math.round(impressions * (0.012 + (h % 7) / 1000)), comments: 2 + (h % 14), reshares: h % 6 };
}

export default async function Published() {
  const user = await requireSubscriber();
  const demo = isDemo();
  const { rows, tz } = await asUser(user.id, async (tx) => ({
    rows: await tx.select({ id: publications.id, status: publications.status, externalId: publications.externalPostId, at: publications.publishedAt, created: publications.createdAt, body: drafts.body })
      .from(publications).innerJoin(drafts, eq(drafts.id, publications.draftId)).orderBy(desc(publications.createdAt)).limit(50),
    tz: ((await tx.select({ c: profiles.cadence }).from(profiles).where(eq(profiles.userId, user.id)))[0]?.c as { tz?: string })?.tz ?? "UTC",
  }));
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
        <p className="mt-1 text-muted-foreground">
          Everything Cadence has posted for you. {demo ? "Numbers below are sample data for the demo." : "Post results appear here once LinkedIn approves analytics access for Cadence."}
        </p>
      </div>
      {rows.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Nothing published yet. Approved posts appear here after their slot.</p>}
      {rows.map((r) => {
        const m = demo && r.status === "published" ? sample(r.id) : null;
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
                <dl className="grid grid-cols-4 gap-2 rounded-lg bg-muted p-3 text-center text-sm" aria-label="Sample results">
                  {Object.entries(m).map(([k, v]) => <div key={k}><dt className="text-muted-foreground capitalize">{k}</dt><dd className="text-lg font-semibold">{v.toLocaleString()}</dd></div>)}
                </dl>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
