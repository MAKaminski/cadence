"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileArchive, PenLine, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ImportView, Kind, SuggestionView } from "@/services/history";
import * as act from "./actions";

type Source = "chatgpt" | "claude";
const NAME: Record<Source, string> = { chatgpt: "ChatGPT", claude: "Claude" };
const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`);
const ACCEPT = ".zip,.json,application/zip,application/json";
const PARALLEL = 3;

/** Where each export lives in the product, as of 2026-10. Both arrive by email as a .zip. */
const HOW: Record<Source, string[]> = {
  chatgpt: [
    "In ChatGPT, open your profile menu → Settings → Data controls → Export data, then Export.",
    "OpenAI emails you a link, usually within minutes. It works for 24 hours.",
    "Download the .zip and drop it here as it is. If it came in several parts, use part 1 (the one with conversations.json).",
  ],
  claude: [
    "In Claude, open your initials menu → Settings → Privacy → Export data. (Not from the phone apps.)",
    "Anthropic emails you a link. It works for 24 hours, and you need to be signed in to download.",
    "Download the .zip and drop it here as it is.",
  ],
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `The server said ${res.status}.`), { status: res.status });
  return body as T;
}

/** PUT one chunk, retried on network errors and server errors; a refusal (4xx) stops the upload. */
async function sendChunk(id: string, idx: number, blob: Blob) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await json<{ received: number }>(await fetch(`/app/import/uploads/${id}/chunks/${idx}`, { method: "PUT", body: blob, headers: { "content-type": "application/octet-stream" } }));
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      if ((status >= 400 && status < 500) || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

type Phase = { kind: "idle" } | { kind: "uploading"; source: Source; name: string; sent: number; total: number } | { kind: "working"; imp: ImportView };

export function Importer({ maxBytes, current, samples }: { maxBytes: number; current: ImportView | null; samples?: Record<Source, string> }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(current && current.status !== "uploading" ? { kind: "working", imp: current } : { kind: "idle" });
  const [over, setOver] = useState<Source | null>(null);
  const inputs = { chatgpt: useRef<HTMLInputElement>(null), claude: useRef<HTMLInputElement>(null) };
  const busy = phase.kind !== "idle";

  // While the worker reads the file, poll its progress; refresh the page when it's done.
  const workingId = phase.kind === "working" ? phase.imp.id : null;
  useEffect(() => {
    if (!workingId) return;
    let stop = false;
    const tick = async () => {
      try {
        const imp = await json<ImportView>(await fetch(`/app/import/uploads/${workingId}`, { cache: "no-store" }));
        if (stop) return;
        if (imp.status === "ready" || imp.status === "failed") {
          setPhase({ kind: "idle" });
          if (imp.status === "ready") toast.success("Your history is read. Review the suggestions below.");
          else toast.error(imp.error ?? "That import failed.");
          router.refresh();
          return;
        }
        setPhase({ kind: "working", imp });
      } catch { /* try again on the next tick */ }
      if (!stop) setTimeout(tick, 1500);
    };
    const t = setTimeout(tick, 1000);
    return () => { stop = true; clearTimeout(t); };
  }, [workingId, router]);

  const upload = useCallback(async (source: Source, file: File) => {
    if (busy) return;
    if (file.size > maxBytes) { toast.error(`That file is over the ${maxBytes / 1073741824} GB limit.`); return; }
    if (!/\.(zip|json)$/i.test(file.name)) { toast.error("Upload the .zip your export came in, or the conversations.json inside it."); return; }
    setPhase({ kind: "uploading", source, name: file.name, sent: 0, total: file.size });
    try {
      const start = await json<{ import: ImportView; received: number[] }>(await fetch("/app/import/uploads", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, name: file.name, size: file.size }),
      }));
      const { id, chunks, chunkBytes } = start.import;
      const have = new Set(start.received);
      const todo = [...Array(chunks).keys()].filter((i) => !have.has(i));
      const len = (i: number) => Math.min(chunkBytes, file.size - i * chunkBytes);
      let sent = [...have].reduce((a, i) => a + len(i), 0);
      setPhase({ kind: "uploading", source, name: file.name, sent, total: file.size });
      // A few chunks at a time; the first goes alone, so a file that isn't an export is refused at once.
      const first = todo[0] === 0 ? [todo.shift()!] : [];
      for (const group of [first, todo]) {
        const queue = [...group];
        await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
          for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
            await sendChunk(id, i, file.slice(i * chunkBytes, i * chunkBytes + len(i)));
            sent += len(i);
            setPhase({ kind: "uploading", source, name: file.name, sent, total: file.size });
          }
        }));
      }
      const imp = await json<ImportView>(await fetch(`/app/import/uploads/${id}/finish`, { method: "POST" }));
      setPhase({ kind: "working", imp });
    } catch (e) {
      toast.error((e as Error).message || "The upload stopped. Choose the same file again to carry on where it left off.");
      setPhase({ kind: "idle" });
      router.refresh();
    }
  }, [busy, maxBytes, router]);

  const pickFile = (source: Source) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void upload(source, f);
  };
  const trySample = (source: Source) => samples && upload(source, new File([samples[source]], "conversations.json", { type: "application/json" }));

  return (
    <div className="flex flex-col gap-4">
      {current?.status === "uploading" && phase.kind === "idle" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950" data-testid="resume">
          Your upload of {current.fileName} stopped at {Math.round(((current.progress.done ?? 0) / current.bytes) * 100)}%. Choose the same file again and it carries on from there.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(["chatgpt", "claude"] as const).map((s) => (
          <Card key={s} data-testid={`source-${s}`}
            className={cn("transition-colors", over === s && "border-primary ring-2 ring-primary/30")}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const f = e.dataTransfer.files?.[0]; if (f) void upload(s, f); }}>
            <CardHeader>
              <CardTitle>{NAME[s]}</CardTitle>
              <CardDescription>Drop the .zip here, or choose it. Up to {maxBytes / 1073741824} GB.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <input ref={inputs[s]} type="file" accept={ACCEPT} className="sr-only" aria-label={`${NAME[s]} export file`} onChange={pickFile(s)} />
              <Button size="lg" disabled={busy} onClick={() => inputs[s].current?.click()}><Upload className="size-4" aria-hidden />Import from {NAME[s]}</Button>
              {samples && <Button variant="link" className="px-0" disabled={busy} onClick={() => trySample(s)}>Use the sample {NAME[s]} export (demo)</Button>}
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">How to get your {NAME[s]} export</summary>
                <ol className="ml-4 mt-2 list-decimal space-y-1">{HOW[s].map((x) => <li key={x}>{x}</li>)}</ol>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>
      {phase.kind !== "idle" && <Status phase={phase} />}
    </div>
  );
}

function Status({ phase }: { phase: Exclude<Phase, { kind: "idle" }> }) {
  let label: string, pct: number, detail = "";
  if (phase.kind === "uploading") {
    pct = (phase.sent / Math.max(phase.total, 1)) * 100;
    label = `Uploading ${phase.name} · ${size(phase.sent)} of ${size(phase.total)}`;
    detail = "Keep this page open. If the connection drops, choose the same file again and it carries on.";
  } else {
    const { status, progress: p, stats } = phase.imp;
    const frac = (p.done ?? 0) / Math.max(p.total ?? 1, 1);
    if (status === "queued") { pct = 2; label = "Uploaded. Waiting to be read…"; }
    else if (status === "reading") {
      pct = 5 + frac * 65;
      label = `Reading your conversations · ${Math.round(frac * 100)}%`;
      detail = stats.conversations ? `${stats.conversations.toLocaleString()} conversations, ${(stats.kept ?? 0).toLocaleString()} of your messages kept so far.` : "";
    } else { pct = 70 + frac * 30; label = `Finding suggestions${p.total && p.total > 1 ? ` · step ${Math.min((p.done ?? 0) + 1, p.total)} of ${p.total}` : ""}…`; }
    detail ||= "You can leave this page; the work carries on.";
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4" role="status" aria-live="polite" data-testid="import-status">
      <p className="flex items-center gap-2 text-sm font-medium"><FileArchive className="size-4" aria-hidden />{label}</p>
      <Progress value={Math.round(pct)} aria-label="Import progress" />
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Review

const GROUPS: { kind: Kind; title: string; about: string }[] = [
  { kind: "fact", title: "Facts about you", about: "Only claims you made about yourself. Drafts may state only what's on your facts list." },
  { kind: "topic", title: "Topics you keep coming back to", about: "What drafts stay inside." },
  { kind: "voice", title: "Your voice", about: "Longer passages you wrote. Accepting one adds it to your three sample posts (replacing the shortest if you have three)." },
  { kind: "no_go", title: "Never write about", about: "Things you treated as private. A draft that mentions one is held for you." },
  { kind: "idea", title: "Post ideas", about: "Accepted ideas stay here. Draft one and it becomes this week's check-in." },
];

export function Review({ items }: { items: SuggestionView[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Suggestions" className="flex flex-col gap-4" data-testid="suggestions">
      {GROUPS.map((g) => {
        const list = items.filter((x) => x.kind === g.kind);
        if (!list.length) return null;
        const pending = list.filter((x) => x.status === "pending").length;
        return (
          <Card key={g.kind} data-testid={`group-${g.kind}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{g.title}{pending > 0 && <Badge variant="secondary">{pending} to review</Badge>}</CardTitle>
              <CardDescription>{g.about}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {list.map((s) => <Item key={`${s.id}:${s.status}`} s={s} />)}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function Item({ s }: { s: SuggestionView }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Not saved."); else { if (r.message) toast.success(r.message); router.refresh(); }
  });
  const accepted = s.status === "accepted";
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" data-testid="suggestion" data-kind={s.kind}>
      <div className="min-w-0 text-sm">
        <p className={cn(s.kind === "voice" && "line-clamp-6 whitespace-pre-line")}>{s.body}</p>
        {s.evidence && <p className="mt-1 text-xs text-muted-foreground">{s.kind === "voice" ? s.evidence : <>You wrote: “{s.evidence}”</>}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {accepted ? (
          s.kind === "idea"
            ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => act.draftIdea(s.id))}><PenLine className="size-4" aria-hidden />Draft it</Button>
            : <Badge variant="secondary">Added</Badge>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={() => run(() => act.decide(s.id, "accept"))}><Check className="size-4" aria-hidden />Accept</Button>
            <Button size="sm" variant="ghost" disabled={busy} aria-label="Dismiss" onClick={() => run(() => act.decide(s.id, "dismiss"))}><X className="size-4" aria-hidden /></Button>
          </>
        )}
      </div>
    </div>
  );
}

export function DeleteImported({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button variant="outline" disabled={busy || disabled} onClick={() => {
      if (!confirm("Delete every import: the messages kept from them and all suggestions? What you accepted stays in your profile.")) return;
      start(async () => { const r = await act.deleteImported(); if (!r.ok) toast.error(r.error); else { toast.success(r.message ?? "Deleted."); router.refresh(); } });
    }}><Trash2 className="size-4" aria-hidden />Delete imported data</Button>
  );
}
