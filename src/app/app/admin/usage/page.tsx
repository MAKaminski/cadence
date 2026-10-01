import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSubscriber } from "@/lib/session";
import { FLAGS, isAdmin } from "@/lib/flags";
import { isDemo } from "@/lib/mode";
import { usageReport } from "@/services/usage-report";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Usage" };

const usd = (n: number) => `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
const ACTION: Record<string, string> = {
  add_url: "Added by link", add_upload: "Uploaded", rate_up: "Rated good", rate_down: "Rated bad", rate_clear: "Rating cleared",
  analyze: "Analysed", analyze_failed: "Analysis failed", delete: "Deleted",
};

export default async function UsagePage() {
  const user = await requireSubscriber();
  if (!isAdmin(user)) notFound();
  const r = await usageReport("examples", 30);
  const peak = Math.max(1, ...r.daily.map((d) => d.added + d.rated + d.analyzed));
  const stats = [
    { label: "People (30 days)", value: String(r.totals.users) },
    { label: "Actions (30 days)", value: String(r.totals.events) },
    { label: "Analysis cost (30 days)", value: usd(r.totals.cost) },
    { label: "Stored files", value: r.stored ? `${r.stored.files} · ${mb(r.stored.bytes)}` : "0" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1 text-muted-foreground">Examples over the last {r.days} days. Only operators (CADENCE_ADMINS) see this page.</p>
      </div>

      <Card data-testid="flag-status">
        <CardHeader>
          <CardTitle>Feature flag: examples</CardTitle>
          <CardDescription>{FLAGS.examples}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {isDemo() ? <p>Demo mode: on for everyone.</p>
            : r.flag.enabledForAll ? <p>On for everyone.</p>
            : r.flag.allowEmails.length ? <p>On for {r.flag.allowEmails.length} allow-listed account{r.flag.allowEmails.length > 1 ? "s" : ""}: {r.flag.allowEmails.join(", ")}.</p>
            : <p>Off for everyone. Turn it on for an account with <code>pnpm flag examples --allow you@example.com</code>.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} size="sm"><CardHeader><CardDescription>{s.label}</CardDescription><p className="text-2xl font-semibold tabular-nums">{s.value}</p></CardHeader></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>By day</CardTitle><CardDescription>Added, rated and analysed per day.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Actions per day, last 30 days">
            {r.daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col-reverse" title={`${d.day}: ${d.added} added, ${d.rated} rated, ${d.analyzed} analysed, ${usd(d.cost)}`}>
                <div className="bg-primary" style={{ height: `${(d.added / peak) * 128}px` }} />
                <div className="bg-emerald-500" style={{ height: `${(d.rated / peak) * 128}px` }} />
                <div className="bg-sky-400" style={{ height: `${(d.analyzed / peak) * 128}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground"><span>{r.daily[0]?.day}</span><span>{r.daily.at(-1)?.day}</span></div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />Added</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" />Rated</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-sky-400" />Analysed</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By action</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="usage-actions">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1 font-normal">Action</th><th className="font-normal text-right">Count</th><th className="font-normal text-right">People</th><th className="font-normal text-right">Size</th><th className="font-normal text-right">Cost</th></tr></thead>
              <tbody>
                {r.actions.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">Nothing yet.</td></tr>}
                {r.actions.map((a) => (
                  <tr key={a.action} className="border-t"><td className="py-1.5">{ACTION[a.action] ?? a.action}</td><td className="text-right tabular-nums">{a.events}</td><td className="text-right tabular-nums">{a.users}</td><td className="text-right tabular-nums">{a.bytes ? mb(a.bytes) : "–"}</td><td className="text-right tabular-nums">{a.cost ? usd(a.cost) : "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Most active</CardTitle>{r.stored && <CardDescription>{r.stored.examples} examples kept · {r.stored.up} rated good · {r.stored.down} rated bad · {r.stored.failed} failed analysis</CardDescription>}</CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1 font-normal">Account</th><th className="font-normal text-right">Actions</th><th className="font-normal text-right">Cost</th><th className="font-normal text-right">Last</th></tr></thead>
              <tbody>
                {r.people.length === 0 && <tr><td colSpan={4} className="py-3 text-muted-foreground">Nobody yet.</td></tr>}
                {r.people.map((p) => (
                  <tr key={p.email} className="border-t"><td className="max-w-48 truncate py-1.5">{p.email}</td><td className="text-right tabular-nums">{p.events}</td><td className="text-right tabular-nums">{usd(p.cost)}</td><td className="text-right tabular-nums">{p.last}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
