"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileText, Link2, RotateCcw, ThumbsDown, ThumbsUp, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ExampleView, Guidance, Rating } from "@/services/examples";
import * as act from "./actions";

const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf";

function RatingPicker({ value, onChange, disabled }: { value: Rating | null; onChange: (r: Rating | null) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Rating">
      <Button type="button" size="sm" variant={value === "up" ? "default" : "outline"} aria-pressed={value === "up"} disabled={disabled}
        onClick={() => onChange(value === "up" ? null : "up")}><ThumbsUp className="size-4" aria-hidden />Good</Button>
      <Button type="button" size="sm" variant={value === "down" ? "destructive" : "outline"} aria-pressed={value === "down"} disabled={disabled}
        onClick={() => onChange(value === "down" ? null : "down")}><ThumbsDown className="size-4" aria-hidden />Bad</Button>
    </div>
  );
}

export function AddExample({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<Rating | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setUrl(""); setNote(""); setRating(null); setFile(null); if (fileRef.current) fileRef.current.value = ""; };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      if (mode === "url") {
        const r = await act.addUrl(url, note, rating);
        if (!r.ok) { toast.error(r.error); return; }
      } else {
        if (!file) { toast.error("Choose a file to upload."); return; }
        if (file.size > maxMb * 1048576) { toast.error(`That file is over the ${maxMb} MB limit.`); return; }
        const form = new FormData();
        form.set("file", file); form.set("note", note); if (rating) form.set("rating", rating);
        const res = await fetch("/app/examples/upload", { method: "POST", body: form });
        if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? "Upload failed."); return; }
      }
      toast.success("Added. Cadence is reading it now.");
      reset(); router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an example</CardTitle>
        <CardDescription>A LinkedIn post, an article, or a direct link to an image, GIF or video. Or upload one.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" data-testid="add-example">
          <div className="flex gap-1" role="tablist" aria-label="Add by">
            <Button type="button" role="tab" aria-selected={mode === "url"} size="sm" variant={mode === "url" ? "secondary" : "ghost"} onClick={() => setMode("url")}><Link2 className="size-4" aria-hidden />Link</Button>
            <Button type="button" role="tab" aria-selected={mode === "file"} size="sm" variant={mode === "file" ? "secondary" : "ghost"} onClick={() => setMode("file")}><Upload className="size-4" aria-hidden />Upload</Button>
          </div>
          {mode === "url" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ex-url">Link</Label>
              <Input id="ex-url" type="url" inputMode="url" placeholder="https://www.linkedin.com/posts/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ex-file">File</Label>
              <Input id="ex-file" ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, GIF, MP4, WebM, MOV or PDF, up to {maxMb} MB.{file ? ` ${file.name}: ${size(file.size)}.` : ""}</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ex-note">What stands out <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="ex-note" rows={2} maxLength={500} placeholder="e.g. The animation explains the idea before you read a word." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RatingPicker value={rating} onChange={setRating} disabled={busy} />
            <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add example"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function Teaches({ g }: { g: Guidance }) {
  const empty = !g.liked.length && !g.avoid.length;
  return (
    <Card data-testid="teaches">
      <CardHeader>
        <CardTitle>What your ratings teach</CardTitle>
        <CardDescription>{empty ? "Rate an example and its lessons appear here. Every draft uses them." : `From ${g.up} liked and ${g.down} disliked examples. Every draft uses this.`}</CardDescription>
      </CardHeader>
      {!empty && (
        <CardContent className="flex flex-col gap-4 text-sm">
          {g.liked.length > 0 && <div><p className="font-medium">Do more of</p><ul className="ml-4 mt-1 list-disc text-muted-foreground">{g.liked.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {g.avoid.length > 0 && <div><p className="font-medium">Avoid</p><ul className="ml-4 mt-1 list-disc text-muted-foreground">{g.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </CardContent>
      )}
    </Card>
  );
}

function Media({ e }: { e: ExampleView }) {
  const src = `/app/examples/${e.id}/media`;
  if (e.mediaKind === "image" || e.mediaKind === "gif") {
    // eslint-disable-next-line @next/next/no-img-element -- private, per-user bytes; next/image would cache them publicly
    return <img src={src} alt={e.title ?? "Example image"} className="max-h-64 w-full rounded-md border bg-muted object-contain" loading="lazy" />;
  }
  if (e.mediaKind === "video") return <video src={src} controls muted playsInline preload="metadata" className="max-h-64 w-full rounded-md border bg-muted" />;
  if (e.mediaKind === "pdf") return <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted"><FileText className="size-4" aria-hidden />Open the PDF</a>;
  return null;
}

const STATUS: Record<ExampleView["analysisStatus"], string> = { pending: "Reading…", done: "Analysed", failed: "Couldn't analyse", skipped: "Nothing to read" };

export function ExampleCard({ e }: { e: ExampleView }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Not saved."); else { if (done) toast.success(done); router.refresh(); }
  });
  const a = e.analysis;
  const host = e.url ? new URL(e.url).hostname.replace(/^www\./, "") : null;
  return (
    <Card className={cn(e.rating === "up" && "border-emerald-300 dark:border-emerald-800", e.rating === "down" && "border-rose-300 dark:border-rose-800")} data-testid="example">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{e.title || (e.source === "upload" ? "Uploaded file" : host)}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2">
              {e.author && <span>{e.author}</span>}
              {host && <a href={e.url!} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">{host}<ExternalLink className="size-3" aria-hidden /></a>}
              {e.mediaKind !== "none" && <span>{e.mediaKind === "gif" ? "animation" : e.mediaKind}{e.mediaBytes ? `, ${size(e.mediaBytes)}` : ""}</span>}
            </CardDescription>
          </div>
          <Badge variant={e.analysisStatus === "failed" ? "destructive" : e.analysisStatus === "done" ? "secondary" : "outline"}>{STATUS[e.analysisStatus]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <Media e={e} />
        {e.body && <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">{e.body}</p>}
        {e.note && <p><span className="font-medium">Your note:</span> {e.note}</p>}
        {a && (
          <details className="rounded-lg border p-3" data-testid="analysis">
            <summary className="cursor-pointer font-medium">{a.transferable}</summary>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-muted-foreground">
              <dt>Format</dt><dd>{a.format}, {a.length}</dd>
              <dt>Hook</dt><dd>{a.hook.type}{a.hook.firstLine ? `: “${a.hook.firstLine}”` : ""}</dd>
              <dt>Shape</dt><dd>{a.structure}</dd>
              {a.visual && <><dt>Visual</dt><dd>{a.visual.kind}; {a.visual.motion}{a.visual.layout ? `; ${a.visual.layout}` : ""}</dd></>}
              <dt>Close</dt><dd>{a.cta.type}{a.cta.engagementBait ? " (engagement bait)" : ""}</dd>
            </dl>
            {a.strengths.length > 0 && <><p className="mt-2 font-medium">Works</p><ul className="ml-4 list-disc text-muted-foreground">{a.strengths.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {a.weaknesses.length > 0 && <><p className="mt-2 font-medium">Weak</p><ul className="ml-4 list-disc text-muted-foreground">{a.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul></>}
          </details>
        )}
        {e.analysisStatus === "failed" && e.analysisError && <p className="text-destructive">{e.analysisError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <RatingPicker value={e.rating} disabled={busy} onChange={(r) => save(() => act.rate(e.id, r), r ? (r === "up" ? "Rated good." : "Rated bad.") : "Rating cleared.")} />
          <div className="flex gap-1">
            {(e.analysisStatus === "failed" || e.analysisStatus === "skipped") && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(() => act.reanalyze(e.id), "Reading it again.")}><RotateCcw className="size-4" aria-hidden />Try again</Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} aria-label="Delete example" onClick={() => { if (confirm("Delete this example?")) save(() => act.remove(e.id), "Deleted."); }}><Trash2 className="size-4" aria-hidden /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
