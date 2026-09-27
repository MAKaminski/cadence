"use client";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { authClient } from "@/lib/auth-client";

const WHAT: Record<string, { label: string; detail: string; optional: boolean }> = {
  "cadence:read": { label: "See your Cadence", detail: "Status, setup, drafts and why they read that way, results.", optional: false },
  "cadence:write": { label: "Check in and edit drafts", detail: "Save your weekly notes, edit or skip drafts. Nothing posts from this alone.", optional: true },
  "cadence:approve": { label: "Approve drafts to post", detail: "Schedules a draft to post on LinkedIn at your next slot. Only allow this if you'll review each one with the assistant.", optional: true },
};

export function ConsentForm({ requested }: { requested: string[] }) {
  const cadence = requested.filter((s) => s in WHAT);
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(cadence.map((s) => [s, s !== "cadence:approve"])));
  const [pending, start] = useTransition();
  // Buttons stay disabled until the form is interactive, so an early click is never silently lost.
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  const submit = (accept: boolean) => start(async () => {
    const scope = [...requested.filter((s) => !(s in WHAT)), ...cadence.filter((s) => on[s])].join(" ");
    const { data, error } = await authClient.oauth2.consent({ accept, scope });
    const next = (data as { redirect_uri?: string; url?: string } | null)?.redirect_uri ?? (data as { url?: string } | null)?.url;
    if (error || !next) { toast.error(error?.message ?? "That request expired. Start again from your assistant."); return; }
    window.location.href = next;
  });
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3">
        {cadence.map((s) => (
          <li key={s}>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" checked={on[s]} disabled={!WHAT[s].optional} onCheckedChange={(v) => setOn((x) => ({ ...x, [s]: Boolean(v) }))} />
              <span><span className="font-medium">{WHAT[s].label}</span><span className="block text-muted-foreground">{WHAT[s].detail}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Assistants can never post immediately. Approved posts go out on your schedule. Cadence is not affiliated with LinkedIn.</p>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!ready || pending} onClick={() => submit(true)}>Allow</Button>
        <Button className="flex-1" variant="outline" disabled={!ready || pending} onClick={() => submit(false)}>Deny</Button>
      </div>
    </div>
  );
}
