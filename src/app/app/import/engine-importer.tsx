"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importEngineBatch } from "./engine-actions";

const BATCH = 40;

/** Upload a LinkedIn Engine export (scripts/engine-export.mjs): the browser reads it and sends it in batches. */
export function EngineImporter() {
  const [busy, start] = useTransition();
  const [done, setDone] = useState<{ added: number; existing: number; snapshots: number; skipped: number; total: number } | null>(null);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const upload = (f: File | undefined) => start(async () => {
    if (!f) return;
    let data: { source?: string; version?: number; posts?: unknown[] };
    try { data = JSON.parse(await f.text()); } catch { toast.error("That isn't a LinkedIn Engine export (it isn't JSON)."); return; }
    if (data.source !== "linkedin-engine" || data.version !== 1 || !Array.isArray(data.posts)) { toast.error("That isn't a LinkedIn Engine export."); return; }
    const sum = { added: 0, existing: 0, snapshots: 0, skipped: 0, total: data.posts.length };
    for (let i = 0; i < data.posts.length; i += BATCH) {
      setProgress(`Importing ${Math.min(i + BATCH, data.posts.length)} of ${data.posts.length} posts…`);
      const r = await importEngineBatch(data.posts.slice(i, i + BATCH));
      if (!r.ok) { toast.error(r.error); setProgress(""); return; }
      for (const k of ["added", "existing", "snapshots", "skipped"] as const) sum[k] += r.result[k];
    }
    setProgress(""); setDone(sum);
    if (input.current) input.current.value = "";
    toast.success(`Imported ${sum.added} posts and ${sum.snapshots} sets of numbers.`);
  });

  return (
    <Card data-testid="engine-import">
      <CardHeader>
        <CardTitle>Bring your LinkedIn Engine history</CardTitle>
        <CardDescription>
          Every post the engine published, with its pillar, hook, score and each capture of its numbers, so Results, What works and your best posts
          start from your real history. Importing the same file again only adds what&apos;s new.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <label htmlFor="engine-file" className="font-medium">LinkedIn Engine export (.json)</label>
        <input ref={input} id="engine-file" type="file" accept=".json,application/json" disabled={busy} onChange={(e) => upload(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm" />
        <p className="text-xs text-muted-foreground">Made by <code>node scripts/engine-export.mjs</code> (read-only against the engine&apos;s database).</p>
        {progress && <p role="status">{progress}</p>}
        {done && (
          <p role="status" data-testid="engine-import-result">
            {done.added} posts added{done.existing ? `, ${done.existing} already here` : ""}, {done.snapshots} sets of numbers{done.skipped ? `, ${done.skipped} skipped` : ""}.{" "}
            <Link href="/app/results?range=all" className="font-medium text-primary underline underline-offset-4">See them on Results</Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
