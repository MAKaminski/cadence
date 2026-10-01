"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Plan, ScheduleView } from "@/services/plan";
import type { EngagePlan, PostingPlan } from "@/engine/plan";
import { setEngage, setPaused, setPosting, updateSchedule } from "./actions";

type Limits = { postsPerWeek: number; commentsPerDay: number; quiet: string[] };
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const daysOf = (mask: string) => DAY.filter((_, i) => mask[i] === "1");
const list = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs.join(" and "));

export function Planner({ plan, limits }: { plan: Plan; limits: Limits }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  /** Run a write, report it, and reload the plan from the server. */
  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Not saved.");
    else { if (done) toast.success(done); router.refresh(); }
  });
  const paused = plan.holds.find((h) => h.name === "all");
  return (
    <div className="flex flex-col gap-6">
      <PauseCard paused={Boolean(paused)} reason={paused?.reason ?? null} busy={busy} save={save} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PostingCard key={`p${plan.posting.perWeek}`} plan={plan} max={limits.postsPerWeek} busy={busy} save={save} />
        <CommentsCard key={`c${plan.engage.perDay}:${plan.volume.engage.window}:${plan.volume.engage.min_gap}`} plan={plan} max={limits.commentsPerDay} busy={busy} save={save} />
      </div>
      <DayTimeline plan={plan} quiet={limits.quiet} save={save} />
    </div>
  );
}

type Save = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void;

/** The patch that turns one slot on or off for one day (the slot switches off with its last day). */
export function dayToggle(r: ScheduleView, i: number) {
  const was = r.mode === "off" ? "0000000" : r.days;
  const mask = [...was].map((c, j) => (j === i ? (c === "1" ? "0" : "1") : c)).join("");
  return !mask.includes("1") ? { mode: "off" as const } : r.mode === "off" ? { mode: "live" as const, days: mask } : { days: mask };
}

function PauseCard({ paused, reason, busy, save }: { paused: boolean; reason: string | null; busy: boolean; save: Save }) {
  return (
    <div id="pause" className={cn("scroll-mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4", paused && "border-amber-300 bg-amber-50 dark:bg-amber-950")} data-testid="pause">
      <div>
        <p className="font-medium">{paused ? "Posting is paused" : "Posting is on"}</p>
        <p className="text-sm text-muted-foreground">{paused ? `Approved posts keep their place and wait${reason ? ` (${reason})` : ""}. Nothing is lost.` : "Approved posts go out in the slots below. Pause any time; nothing is lost."}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={paused} disabled={busy} onCheckedChange={(v) => save(() => setPaused(v), v ? "Posting paused." : "Posting resumed.")} aria-label="Pause posting" />
        Pause
      </label>
    </div>
  );
}

function Stepper({ value, min = 0, max, onChange, label, unit }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string; unit: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label={`One fewer ${unit}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Minus className="size-4" /></Button>
      <Input aria-label={label} type="number" inputMode="numeric" min={min} max={max} value={value} className="w-20 text-center text-xl font-semibold tabular-nums"
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(clamp(n)); }} />
      <Button variant="outline" size="icon" aria-label={`One more ${unit}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}><Plus className="size-4" /></Button>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

/** Asks the server what a new count would change, without saving it. */
function usePreview<T>(target: number, current: number, ask: (n: number) => Promise<{ ok: boolean; data?: T; error?: string }>, key = "") {
  const [preview, setPreview] = useState<{ sig: string; data?: T; error?: string } | null>(null);
  const idle = target === current && !key, sig = `${target}|${key}`;
  useEffect(() => {
    if (idle) return;
    let live = true;
    const t = setTimeout(async () => { const r = await ask(target); if (live) setPreview(r.ok ? { sig, data: r.data } : { sig, error: r.error }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [sig, idle]); // eslint-disable-line react-hooks/exhaustive-deps
  return !idle && preview?.sig === sig ? preview : null;
}

function PostingCard({ plan, max, busy, save }: { plan: Plan; max: number; busy: boolean; save: Save }) {
  const current = plan.posting.perWeek, rows = plan.posting.rows;
  const [target, setTarget] = useState(current);
  const preview = usePreview<PostingPlan>(target, current, (n) => setPosting({ perWeek: n, dryRun: true }));
  const changes = (preview?.data?.rows ?? []).map((c) => {
    const r = rows.find((x) => x.key === c.key)!, was = r.mode === "off" ? "0000000" : r.days, now = c.mode_off ? "0000000" : c.days;
    const on = DAY.filter((_, i) => now[i] === "1" && was[i] !== "1"), off = DAY.filter((_, i) => was[i] === "1" && now[i] !== "1");
    return [on.length ? `slot ${r.slot} on ${list(on)}` : "", off.length ? `slot ${r.slot} off ${list(off)}` : ""];
  });
  const adds = changes.map((c) => c[0]).filter(Boolean), drops = changes.map((c) => c[1]).filter(Boolean);
  const toggle = (r: ScheduleView, i: number) => save(() => updateSchedule(r.key, dayToggle(r, i)));
  return (
    <Card id="posting" className="scroll-mt-6" data-testid="posting">
      <CardHeader>
        <CardTitle>Posts a week</CardTitle>
        <CardDescription>Up to three slots a day. Approved posts go into the next free slot; nothing posts without your approval.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Stepper value={target} max={max} onChange={setTarget} label="Posts a week" unit="posts a week" />
        {target !== current && (
          <div className="rounded-lg bg-muted p-3 text-sm" role="status">
            {preview?.error ? <p className="text-destructive">{preview.error}</p> : preview?.data ? <>
              <p>From {current} to {target} a week{adds.length ? `: turns ${list(adds)}` : ""}{drops.length ? `${adds.length ? "; " : ": "}turns ${list(drops)}` : ""}.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => save(() => setPosting({ perWeek: target }), `${target} posts a week.`)}>Apply</Button>
                <Button size="sm" variant="ghost" onClick={() => setTarget(current)}>Reset</Button>
              </div>
            </> : <p className="text-muted-foreground">Working it out…</p>}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="pb-1 text-left font-normal text-muted-foreground">Slot</th>{DAY.map((d) => <th key={d} className="pb-1 font-normal text-muted-foreground">{d}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="w-4 font-medium">{r.slot}</span>
                      <Input type="time" aria-label={`Slot ${r.slot} time`} defaultValue={r.time} key={r.time} className="h-8 w-32"
                        onBlur={(e) => { if (e.target.value && e.target.value !== r.time) save(() => updateSchedule(r.key, { time: e.target.value }), `Slot ${r.slot} moved to ${e.target.value}.`); }} />
                    </div>
                  </td>
                  {DAY.map((d, i) => {
                    const on = r.mode !== "off" && r.days[i] === "1";
                    return (
                      <td key={d} className="p-0.5 text-center">
                        <button type="button" aria-pressed={on} aria-label={`Slot ${r.slot} on ${d}`} disabled={busy} onClick={() => toggle(r, i)}
                          className={cn("h-8 w-full min-w-8 rounded-md border transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                          {on ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CommentsCard({ plan, max, busy, save }: { plan: Plan; max: number; busy: boolean; save: Save }) {
  const current = plan.engage.perDay, v = plan.volume.engage;
  const [target, setTarget] = useState(current);
  const [win, setWin] = useState<[string, string]>([v.window[0], v.window[1]]);
  const [gap, setGap] = useState(v.min_gap);
  const prefsChanged = win[0] !== v.window[0] || win[1] !== v.window[1] || gap !== v.min_gap;
  const preview = usePreview<EngagePlan>(target, current, (n) => setEngage({ perDay: n, dryRun: true, window: win, minGap: gap }), prefsChanged ? `${win}:${gap}` : "");
  const p = preview?.data;
  const say = p ? [p.on.length ? `adds ${p.on.length} at ${list(p.on.map((o) => o.local_time))}` : "", p.off.length ? `removes ${p.off.length}` : "",
    p.moved.length ? `moves ${p.moved.length}` : ""].filter(Boolean) : [];
  return (
    <Card id="comments" className="scroll-mt-6" data-testid="comments">
      <CardHeader>
        <CardTitle>Comments a day</CardTitle>
        <CardDescription>Comments are written and posted by the Cadence runner on your own computer, with your own Claude account. Plan them here; nothing runs until a runner is connected.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Stepper value={target} max={max} onChange={setTarget} label="Comments a day" unit="comments a day" />
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div className="flex flex-col gap-1"><Label htmlFor="cw0">From</Label><Input id="cw0" type="time" value={win[0]} className="h-8 w-32" onChange={(e) => setWin([e.target.value, win[1]])} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="cw1">Until</Label><Input id="cw1" type="time" value={win[1]} className="h-8 w-32" onChange={(e) => setWin([win[0], e.target.value])} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="cgap">At least (min apart)</Label><Input id="cgap" type="number" min={10} max={120} value={gap} className="h-8 w-24" onChange={(e) => setGap(Number(e.target.value))} /></div>
        </div>
        {(target !== current || prefsChanged) && (
          <div className="rounded-lg bg-muted p-3 text-sm" role="status">
            {preview?.error ? <p className="text-destructive">{preview.error}</p> : p ? <>
              <p>From {current} to {target} a day{say.length ? `: ${say.join("; ")}` : ""}.{p.redistributed ? " No gap was wide enough, so every run is re-spaced." : ""}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => save(() => setEngage({ perDay: target, window: win, minGap: gap }), `${target} comments a day.`)}>Apply</Button>
                <Button size="sm" variant="ghost" onClick={() => { setTarget(current); setWin([v.window[0], v.window[1]]); setGap(v.min_gap); }}>Reset</Button>
              </div>
            </> : <p className="text-muted-foreground">Working it out…</p>}
          </div>
        )}
        {current > 1 && target === current && !prefsChanged && (
          <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => save(() => setEngage({ perDay: current, redistribute: true }), "Comment runs spaced evenly.")}>Space them evenly</Button>
        )}
      </CardContent>
    </Card>
  );
}

const T0 = 5 * 60, T1 = 23 * 60, pct = (m: number) => ((m - T0) / (T1 - T0)) * 100;

/** The day at a glance. Drag a time (or focus it and use the arrow keys) to move that one run. */
function DayTimeline({ plan, quiet, save }: { plan: Plan; quiet: string[]; save: Save }) {
  const lanes = [
    { name: "Posts", rows: plan.posting.rows.filter((r) => r.mode !== "off"), cls: "bg-primary text-primary-foreground" },
    { name: "Comments", rows: plan.engage.rows.filter((r) => r.mode !== "off"), cls: "bg-sky-600 text-white" },
    ...(plan.other.some((r) => r.mode !== "off") ? [{ name: "Other", rows: plan.other.filter((r) => r.mode !== "off"), cls: "bg-muted-foreground text-background" }] : []),
  ];
  const [qs, qe] = [toMin(quiet[0]), toMin(quiet[1])];
  return (
    <Card data-testid="timeline">
      <CardHeader>
        <CardTitle>Your day</CardTitle>
        <CardDescription>Times in {plan.tz.replace(/_/g, " ")}. Drag one to move it; shaded hours are quiet and never used.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="relative mr-2 ml-20 h-5 border-b text-xs text-muted-foreground sm:ml-24">
          {Array.from({ length: 10 }, (_, i) => T0 + i * 120).map((m, i) => <span key={m} className={cn("absolute -translate-x-1/2", i % 2 && "hidden sm:inline")} style={{ left: `${pct(m)}%` }}>{toTime(m)}</span>)}
        </div>
        {lanes.map((l) => (
          <div key={l.name} className="flex items-center gap-2">
            <span className="w-18 shrink-0 text-right text-sm text-muted-foreground sm:w-22">{l.name}</span>
            <Lane rows={l.rows} cls={l.cls} quiet={[qs, qe]} save={save} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Lane({ rows, cls, quiet, save }: { rows: ScheduleView[]; cls: string; quiet: [number, number]; save: Save }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ key: string; m: number } | null>(null);
  const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
  const at = (x: number) => { const b = ref.current!.getBoundingClientRect(); return Math.round((T0 + ((x - b.left) / b.width) * (T1 - T0)) / 5) * 5; };
  const ok = (m: number) => m >= quiet[1] && m < quiet[0];
  const commit = (r: ScheduleView, m: number) => {
    if (!ok(m)) { toast.error("That's in the quiet hours."); return; }
    if (toTime(m) !== r.time) save(() => updateSchedule(r.key, { time: toTime(m) }), `Moved to ${toTime(m)}.`);
  };
  return (
    <div ref={ref} className="relative mr-2 h-9 flex-1 rounded-md border bg-muted/30">
      <div className="absolute inset-y-0 left-0 rounded-l-md bg-muted" style={{ width: `${pct(quiet[1])}%` }} aria-hidden />
      <div className="absolute inset-y-0 right-0 rounded-r-md bg-muted" style={{ left: `${pct(quiet[0])}%` }} aria-hidden />
      {sorted.map((r, i) => {
        const m = drag?.key === r.key ? drag.m : toMin(r.time);
        const room = Math.min(i > 0 ? toMin(r.time) - toMin(sorted[i - 1].time) : 999, i < sorted.length - 1 ? toMin(sorted[i + 1].time) - toMin(r.time) : 999);
        const label = r.slot ? `${r.slot} ${toTime(m)}` : room >= 50 || drag?.key === r.key ? toTime(m) : "";
        return (
          <button key={r.key} type="button" title={`${r.slot ? `Slot ${r.slot}` : "Comment run"} at ${toTime(m)}${r.days !== "1111111" ? ` · ${daysOf(r.days).join(" ")}` : ""}`}
            aria-label={`${r.slot ? `Slot ${r.slot}` : "Comment run"} at ${toTime(m)}. Arrow keys move it five minutes.`}
            className={cn("absolute top-1/2 h-6 min-w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full px-1.5 text-xs font-medium tabular-nums shadow-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring", cls, drag?.key === r.key && "z-10 cursor-grabbing ring-2 ring-foreground")}
            style={{ left: `${pct(m)}%` }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ key: r.key, m: toMin(r.time) }); }}
            onPointerMove={(e) => { if (drag?.key === r.key) setDrag({ key: r.key, m: Math.max(T0, Math.min(T1, at(e.clientX))) }); }}
            onPointerUp={() => { if (drag?.key === r.key) { const m2 = drag.m; setDrag(null); commit(r, m2); } }}
            onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); commit(r, toMin(r.time) + (e.key === "ArrowLeft" ? -5 : 5)); } }}>
            <span className={cn(!r.slot && drag?.key !== r.key && "hidden sm:inline")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
