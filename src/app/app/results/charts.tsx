"use client";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ImpactPost, OutreachWeek, WhatWorks } from "@/services/stats";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Every chart can be read as a table too: for screen readers, and for anyone who prefers numbers. */
function AsTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Show as a table</summary>
      <table className="mt-2 w-full text-left">
        <thead><tr>{head.map((h) => <th key={h} className="border-b py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b py-1 pr-3 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

const outreachConfig = { posts: { label: "Posts published", color: "var(--primary)" } } satisfies ChartConfig;

export function OutreachChart({ data }: { data: OutreachWeek[] }) {
  const target = data[0]?.target ?? 0;
  const rows = data.map((d) => ({ ...d, label: day(`${d.week}T12:00:00Z`) }));
  return (
    <div data-testid="chart-outreach">
      <ChartContainer config={outreachConfig} className="h-56 w-full">
        <BarChart data={rows} margin={{ left: -20, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} domain={[0, Math.max(target + 1, ...data.map((d) => d.posts))]} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: `Target ${target}/week`, position: "insideTopLeft", fontSize: 12, fill: "var(--muted-foreground)" }} />
          <Bar dataKey="posts" radius={4}>
            {rows.map((r) => <Cell key={r.week} fill={r.posts >= target ? "var(--color-posts)" : "color-mix(in oklch, var(--color-posts) 45%, transparent)"} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
      <AsTable head={["Week of", "Posts", "Target"]} rows={rows.map((r) => [r.label, r.posts, r.target])} />
    </div>
  );
}

const impactConfig = {
  impressions: { label: "Impressions", color: "color-mix(in oklch, var(--primary) 35%, transparent)" },
  rate: { label: "Engagement rate", color: "var(--primary)" },
  movingRate: { label: "4-post average", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function ImpactChart({ data }: { data: ImpactPost[] }) {
  const best = data.reduce((b, d) => (d.rate > (b?.rate ?? -1) ? d : b), data[0]);
  const rows = data.map((d) => ({ ...d, label: day(d.publishedAt) }));
  return (
    <div data-testid="chart-impact">
      <ChartContainer config={impactConfig} className="h-64 w-full">
        <ComposedChart data={rows} margin={{ left: -8, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis yAxisId="imp" tickLine={false} axisLine={false} width={48} />
          <YAxis yAxisId="rate" orientation="right" tickLine={false} axisLine={false} tickFormatter={pct} width={48} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => (
            <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{impactConfig[name as keyof typeof impactConfig]?.label}</span><span className="font-mono">{name === "impressions" ? Number(v).toLocaleString() : pct(Number(v))}</span></span>
          )} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar yAxisId="imp" dataKey="impressions" radius={4}>
            {rows.map((r) => <Cell key={r.publicationId} fill={r.publicationId === best?.publicationId ? "color-mix(in oklch, var(--primary) 70%, transparent)" : "var(--color-impressions)"} />)}
          </Bar>
          <Line yAxisId="rate" dataKey="rate" stroke="var(--color-rate)" strokeWidth={2} dot={{ r: 3 }} />
          <Line yAxisId="rate" dataKey="movingRate" stroke="var(--color-movingRate)" strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ChartContainer>
      {best && <p className="mt-2 text-sm"><span className="font-medium">Best post so far:</span> "{best.excerpt}" at {pct(best.rate)} engagement ({best.impressions.toLocaleString()} impressions).</p>}
      <AsTable head={["Posted", "Opening line", "Impressions", "Engagements", "Rate"]} rows={rows.map((r) => [r.label, r.excerpt, r.impressions, r.engagements, pct(r.rate)])} />
    </div>
  );
}

const worksConfig = { rate: { label: "Engagement rate", color: "var(--primary)" } } satisfies ChartConfig;

export function WhatWorksChart({ data }: { data: WhatWorks }) {
  // Hook and score exist for posts imported from LinkedIn Engine; a group shows only when it has posts.
  const groups = ([["angle", "By angle"], ["weekday", "By weekday"], ["length", "By length"], ["hook", "By hook"], ["time", "By time of day"], ["score", "By rubric score"]] as const)
    .filter(([dim]) => data.some((d) => d.dimension === dim));
  return (
    <div data-testid="chart-what-works" className="grid gap-6 md:grid-cols-3">
      {groups.map(([dim, title]) => {
        const rows = data.filter((d) => d.dimension === dim).sort((a, b) => b.rate - a.rate);
        return (
          <div key={dim}>
            <p className="mb-2 text-sm font-medium">{title}</p>
            <ChartContainer config={worksConfig} className="w-full" style={{ height: Math.max(176, rows.length * 40 + 16) }}>
              <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 44 }}>
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={110} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v, _n, item) => <span className="font-mono">{pct(Number(v))} over {(item.payload as { posts: number }).posts} post(s)</span>} />} />
                <Bar dataKey="rate" radius={4}>
                  {rows.map((r, i) => <Cell key={r.label} fill={i === 0 ? "var(--color-rate)" : "color-mix(in oklch, var(--color-rate) 45%, transparent)"} />)}
                  <LabelList dataKey="rate" position="right" formatter={(v) => pct(Number(v))} className="fill-foreground" fontSize={12} />
                </Bar>
              </BarChart>
            </ChartContainer>
            <AsTable head={[title.replace("By ", ""), "Posts", "Rate"]} rows={rows.map((r) => [r.label, r.posts, pct(r.rate)])} />
          </div>
        );
      })}
    </div>
  );
}
