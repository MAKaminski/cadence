"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CircleAlert, Pencil, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Check as CheckT, GateRecord } from "@/engine/types";
import { approveDraft, editDraft, postNow, skipDraft } from "./actions";

export type DraftView = { id: string; body: string; status: string; version: number; scheduledFor: string | null; gate: GateRecord; tz: string };

const ICON = { pass: Check, fixed: Wrench, rewrite: RefreshCw, held: CircleAlert } as const;
const TONE = { pass: "text-emerald-600", fixed: "text-sky-600", rewrite: "text-amber-600", held: "text-red-600" } as const;
const WORD = { pass: "Passed", fixed: "Fixed", rewrite: "Rewrite", held: "Held" } as const;

function when(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function CheckRow({ c }: { c: CheckT }) {
  const Icon = ICON[c.outcome];
  return (
    <li className="flex gap-2 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[c.outcome]}`} aria-label={WORD[c.outcome]} />
      <span><span className="font-medium">{c.label}</span>{c.detail ? <span className="text-muted-foreground"> · {c.detail}</span> : null}</span>
    </li>
  );
}

export function DraftCard({ d }: { d: DraftView }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(d.body);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.error(r.error); else toast.success(r.message && d.status !== "scheduled" ? `${ok} for ${when(r.message, d.tz)}` : ok);
  });
  const g = d.gate;
  const open = d.status === "draft" || d.status === "held";

  return (
    <Card data-testid="draft" data-status={d.status}>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        {d.status === "held" && <Badge variant="destructive">Held for you</Badge>}
        {d.status === "draft" && <Badge variant="secondary">Ready to review</Badge>}
        {d.status === "scheduled" && <Badge>Scheduled · {d.scheduledFor ? when(d.scheduledFor, d.tz) : ""}</Badge>}
        {d.status === "published" && <Badge variant="outline">Published</Badge>}
        {d.status === "failed" && <Badge variant="destructive">Not posted</Badge>}
        <span className="text-sm text-muted-foreground">{g.angle}{d.version > 1 ? ` · edited (v${d.version})` : ""}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editing
          ? <Textarea aria-label="Edit post" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          : <p className="whitespace-pre-wrap leading-relaxed">{d.body}</p>}
        {d.status === "held" && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {g.checks.filter((c) => c.outcome === "held").map((c) => `${c.label}: ${c.detail}`).join(" · ")}. Edit the post, add the fact to your setup, or approve it as it is if it's right.
          </p>
        )}
        <details className="group rounded-lg border p-3" data-testid="why">
          <summary className="cursor-pointer text-sm font-medium">Why this draft</summary>
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <p><span className="font-medium">Angle:</span> {g.why}</p>
            <ul className="flex flex-col gap-1.5">{g.checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
            {g.adjustments.length > 0 && (
              <div><p className="font-medium">What changed</p><ul className="ml-4 list-disc text-muted-foreground">{g.adjustments.map((a) => <li key={a}>{a}</li>)}</ul></div>
            )}
            <p className="text-muted-foreground">Picked from {g.variantsConsidered} variants{g.rewritten ? ", rewritten once" : ""} · {g.model} · ${g.costUsd.toFixed(4)}</p>
          </div>
        </details>
      </CardContent>
      {(open || d.status === "scheduled") && (
        <CardFooter className="flex flex-wrap gap-2">
          {editing ? <>
            <Button disabled={pending} onClick={() => act(async () => { const r = await editDraft(d.id, body); if (r.ok) setEditing(false); return r; }, "Saved and re-checked")}>Save changes</Button>
            <Button variant="ghost" disabled={pending} onClick={() => { setBody(d.body); setEditing(false); }}>Cancel</Button>
          </> : <>
            {open && <Button disabled={pending} onClick={() => act(() => approveDraft(d.id), "Approved and scheduled")}>Approve</Button>}
            {d.status === "scheduled" && <Button disabled={pending} onClick={() => act(() => postNow(d.id), "Posting now")}>Post now</Button>}
            <Button variant="outline" disabled={pending} onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden />Edit</Button>
            <Button variant="ghost" disabled={pending} onClick={() => act(() => skipDraft(d.id), "Skipped")}>Skip</Button>
          </>}
        </CardFooter>
      )}
    </Card>
  );
}
