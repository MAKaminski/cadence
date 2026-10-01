"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MANUAL_FIELDS, type ManualKey } from "@/lib/metric-input";
import { saveNumbers } from "../actions";

/** Copy a post's numbers from LinkedIn (its "View analytics" page) into Cadence. */
export function NumbersForm({ publicationId, initial, analyticsUrl }: { publicationId: string; initial: Partial<Record<ManualKey, number | null>>; analyticsUrl: string | null }) {
  const [vals, setVals] = useState<Partial<Record<ManualKey, string>>>(
    Object.fromEntries(MANUAL_FIELDS.map((f) => [f.key, initial[f.key] == null ? "" : String(initial[f.key])])));
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-3" data-testid="numbers-form" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await saveNumbers(publicationId, vals);
      if (!r.ok) toast.error(r.error); else toast.success("Numbers saved. Results is updated.");
    }); }}>
      <p className="text-xs text-muted-foreground">
        Open {analyticsUrl ? <a className="underline" href={analyticsUrl} target="_blank" rel="noreferrer">the post on LinkedIn</a> : "the post on LinkedIn"}, choose <b>View analytics</b> under it, and copy the numbers here.
        Blank counts as 0. Each save is kept, so you can update them as the post grows.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {MANUAL_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {f.label}{f.required && " *"}
            <Input inputMode="numeric" value={vals[f.key] ?? ""} required={f.required} aria-label={f.label}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save numbers"}</Button></div>
    </form>
  );
}
