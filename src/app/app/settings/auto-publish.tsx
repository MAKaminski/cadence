"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setAutoPublish } from "../actions";

export function AutoPublish({ on, unlocked, remaining }: { on: boolean; unlocked: boolean; remaining: number }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start gap-3">
      <Switch id="auto" checked={value} disabled={pending || (!unlocked && !value)} onCheckedChange={(v) => start(async () => {
        const r = await setAutoPublish(v);
        if (!r.ok) { toast.error(r.error); return; }
        setValue(v); toast.success(v ? "Clean drafts will now schedule themselves." : "Every draft waits for you again.");
      })} />
      <label htmlFor="auto" className="text-sm">
        <span className="font-medium">Post clean drafts automatically</span>
        <span className="block text-muted-foreground">
          {unlocked ? "Drafts that pass every check go straight into your next slot. Anything held still waits for you." : `Unlocks after ${remaining} more clean approval${remaining === 1 ? "" : "s"}, so you've seen how Cadence writes first.`}
        </span>
      </label>
    </div>
  );
}
