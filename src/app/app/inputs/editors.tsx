"use client";
// The editable controls on the Inputs page. Each one calls the server action its home page uses
// (or, for setup fields, the API's own rules), then reloads the page so the direction updates too.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChannelView } from "@/services/channels";
import type { ScheduleView } from "@/services/plan";
import { setEngage, setPaused, setPosting, updateSchedule } from "../plan/actions";
import { dayToggle } from "../plan/planner";
import { useChannel } from "../channels/channel-card";
import { saveSetupField, saveVoiceSamples, type SetupField } from "./actions";

type Save = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => void;
function useSave(): [boolean, Save] {
  const router = useRouter();
  const [busy, start] = useTransition();
  return [busy, (fn, done) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Not saved."); else { toast.success(done); router.refresh(); }
  })];
}

/** A text or list field from setup. Lists are one item per line. */
export function SetupFieldEditor({ id, field, label, value, multiline, hint }: { id: string; field: SetupField; label: string; value: string; multiline?: boolean; hint?: string }) {
  const [busy, save] = useSave();
  const [v, setV] = useState(value);
  const dirty = v !== value;
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save(() => saveSetupField(field, v), `${label} saved.`); }}>
      <Label htmlFor={`in-${id}`} className="sr-only">{label}</Label>
      {multiline ? <Textarea id={`in-${id}`} rows={Math.min(8, Math.max(2, v.split("\n").length + 1))} value={v} onChange={(e) => setV(e.target.value)} />
        : <Input id={`in-${id}`} value={v} onChange={(e) => setV(e.target.value)} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !dirty}>{busy ? "Saving…" : "Save"}</Button>
        {dirty && <Button type="button" size="sm" variant="ghost" onClick={() => setV(value)}>Undo</Button>}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </form>
  );
}

export function SamplesEditor({ value }: { value: string[] }) {
  const [busy, save] = useSave();
  const [v, setV] = useState([0, 1, 2].map((i) => value[i] ?? ""));
  const dirty = v.some((s, i) => s !== (value[i] ?? ""));
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save(() => saveVoiceSamples(v), "Voice samples saved."); }}>
      {v.map((s, i) => (
        <details key={i} className="rounded-md border px-3 py-2" open={!s}>
          <summary className="cursor-pointer text-sm">{s ? <span className="text-muted-foreground">{s.split("\n")[0].slice(0, 80)}{s.length > 80 ? "…" : ""}</span> : `Post ${i + 1} (empty)`}</summary>
          <Label htmlFor={`in-sample${i}`} className="sr-only">{`A post you've written (${i + 1} of 3)`}</Label>
          <Textarea id={`in-sample${i}`} rows={5} className="mt-2" value={s} onChange={(e) => setV(v.map((x, j) => (j === i ? e.target.value : x)))} />
        </details>
      ))}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !dirty}>{busy ? "Saving…" : "Save"}</Button>
        <span className="text-xs text-muted-foreground">At least two posts of a few sentences each.</span>
      </div>
    </form>
  );
}

const MODELS = [["claude-sonnet-5", "Claude Sonnet 5"], ["claude-opus-5", "Claude Opus 5"]] as const;
export function ModelEditor({ value }: { value: string }) {
  const [busy, save] = useSave();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Writing model">
      {MODELS.map(([id, name]) => (
        <Button key={id} type="button" size="sm" role="radio" aria-checked={value === id} variant={value === id ? "default" : "outline"} disabled={busy}
          onClick={() => value !== id && save(() => saveSetupField("model", id), `${name} writes your drafts now.`)}>{name}</Button>
      ))}
    </div>
  );
}

function NumberSave({ id, label, value, max, onSave, unit }: { id: string; label: string; value: number; max: number; onSave: (n: number) => void; unit: string }) {
  const [v, setV] = useState(value);
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <Label htmlFor={id} className="sr-only">{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={0} max={max} value={v} className="w-20 text-center tabular-nums"
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setV(Math.max(0, Math.min(max, Math.round(n)))); }} />
      <span className="text-sm text-muted-foreground">{unit}</span>
      <Button type="submit" size="sm" disabled={v === value}>Save</Button>
    </form>
  );
}

export function PostsEditor({ value, max }: { value: number; max: number }) {
  const [busy, save] = useSave();
  return <fieldset disabled={busy}><NumberSave key={value} id="in-posts" label="Posts a week" value={value} max={max} unit={`posts a week (0–${max})`}
    onSave={(n) => save(() => setPosting({ perWeek: n }), `${n} posts a week.`)} /></fieldset>;
}

export function CommentsEditor({ value, max }: { value: number; max: number }) {
  const [busy, save] = useSave();
  return <fieldset disabled={busy}><NumberSave key={value} id="in-comments" label="Comments a day" value={value} max={max} unit={`comments a day (0–${max})`}
    onSave={(n) => save(() => setEngage({ perDay: n }), `${n} comments a day.`)} /></fieldset>;
}

export function WindowEditor({ perDay, window, gap }: { perDay: number; window: [string, string]; gap: number }) {
  const [busy, save] = useSave();
  const [w, setW] = useState(window);
  const [g, setG] = useState(gap);
  const dirty = w[0] !== window[0] || w[1] !== window[1] || g !== gap;
  return (
    <form className="flex flex-wrap items-end gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); save(() => setEngage({ perDay, window: w, minGap: g }), "Comment window saved."); }}>
      <div className="flex flex-col gap-1"><Label htmlFor="in-cw0">From</Label><Input id="in-cw0" type="time" value={w[0]} className="h-8 w-32" onChange={(e) => setW([e.target.value, w[1]])} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="in-cw1">Until</Label><Input id="in-cw1" type="time" value={w[1]} className="h-8 w-32" onChange={(e) => setW([w[0], e.target.value])} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="in-gap">Minutes apart</Label><Input id="in-gap" type="number" min={10} max={120} value={g} className="h-8 w-24" onChange={(e) => setG(Number(e.target.value))} /></div>
      <Button type="submit" size="sm" disabled={busy || !dirty}>Save</Button>
    </form>
  );
}

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function SlotsEditor({ rows }: { rows: ScheduleView[] }) {
  const [busy, save] = useSave();
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-2">
          <span className="w-12 text-sm font-medium">Slot {r.slot}</span>
          <Input type="time" aria-label={`Slot ${r.slot} time`} defaultValue={r.time} key={r.time} className="h-8 w-32"
            onBlur={(e) => { if (e.target.value && e.target.value !== r.time) save(() => updateSchedule(r.key, { time: e.target.value }), `Slot ${r.slot} moved to ${e.target.value}.`); }} />
          <div className="flex gap-0.5">
            {DAY.map((d, i) => {
              const on = r.mode !== "off" && r.days[i] === "1";
              return (
                <button key={d} type="button" aria-pressed={on} aria-label={`Slot ${r.slot} on ${d}`} title={`Slot ${r.slot} on ${d}`} disabled={busy}
                  onClick={() => save(() => updateSchedule(r.key, dayToggle(r, i)), `Slot ${r.slot} ${on ? "off" : "on"} ${d}.`)}
                  className={cn("h-8 w-9 rounded-md border text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>
                  {d.slice(0, 2)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PauseEditor({ paused }: { paused: boolean }) {
  const [busy, save] = useSave();
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={paused} disabled={busy} aria-label="Pause posting" onCheckedChange={(v) => save(() => setPaused(v), v ? "Posting paused." : "Posting resumed.")} />
      {paused ? "Paused" : "Posting is on"}
    </label>
  );
}

function ChannelRow({ c, demo }: { c: ChannelView; demo: boolean }) {
  const { busy, opening, connect } = useChannel(c, demo, "/app/inputs?tab=publishing");
  const conn = c.connection;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 font-medium">{c.name}</span>
      {conn ? <Badge variant={conn.status === "active" ? "secondary" : "destructive"}>{conn.status === "active" ? "Connected" : conn.status === "expiring" ? "Ending soon" : "Reconnect needed"}</Badge>
        : <Badge variant="outline">Not connected</Badge>}
      {c.id !== "linkedin" && c.connectable && (!conn || conn.status !== "active") && (
        <Button size="sm" variant="outline" onClick={connect} disabled={busy || opening}>{opening ? `Opening ${c.name}…` : conn ? `Reconnect ${c.name}` : `Connect ${c.name}`}</Button>
      )}
      {!c.connectable && !conn && <span className="text-muted-foreground">Not set up on this server yet.</span>}
    </li>
  );
}

export function ChannelsEditor({ channels, demo }: { channels: ChannelView[]; demo: boolean }) {
  return <ul className="flex flex-col gap-2">{channels.map((c) => <ChannelRow key={c.id} c={c} demo={demo} />)}</ul>;
}

function DraftingRow({ c, demo }: { c: ChannelView; demo: boolean }) {
  const { busy, setDrafting } = useChannel(c, demo);
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>Draft each post for {c.name} <span className="text-muted-foreground">(up to {c.maxChars} characters)</span></span>
      <Switch checked={c.connection!.drafting} disabled={busy} aria-label={`Draft for ${c.name}`} onCheckedChange={setDrafting} />
    </label>
  );
}

export function DraftingEditor({ channels, demo }: { channels: ChannelView[]; demo: boolean }) {
  const on = channels.filter((c) => c.connection && c.id !== "linkedin");
  if (!on.length) return <p className="text-sm text-muted-foreground">LinkedIn always drafts. Connect another channel to choose here. <Link className="text-primary underline-offset-4 hover:underline" href="/app/channels">Channels</Link></p>;
  return <div className="flex flex-col gap-2">{on.map((c) => <DraftingRow key={c.id} c={c} demo={demo} />)}</div>;
}

/** Inputs edited on their home page (a review queue, a per-post form, an upload): one button there. */
export function LinkEditor({ href, label }: { href: string; label: string }) {
  return <Button variant="outline" size="sm" render={<Link href={href} />}>{label}</Button>;
}
