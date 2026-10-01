"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import type { ChannelView } from "@/services/channels";
import * as act from "./actions";

/** Connect, toggle and disconnect one channel. Shared by the Channels page and the Inputs page. */
export function useChannel(c: ChannelView, demo: boolean, back = "/app/channels") {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [opening, setOpening] = useState(false);
  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Not saved."); else { toast.success(done); router.refresh(); }
  });
  /** One click: off to the platform's consent screen and back, connected. */
  const connect = async () => {
    if (demo) return save(() => act.connectDemo(c.id), `${c.name} connected (demo).`);
    setOpening(true);
    const { error } = await authClient.linkSocial({ provider: c.provider as "twitter", callbackURL: back, errorCallbackURL: back });
    if (error) { toast.error(error.message ?? `Could not open ${c.name}. Try again.`); setOpening(false); }
  };
  const setDrafting = (on: boolean) => save(() => act.setDrafting(c.id, on), on ? `${c.name} drafts on.` : `${c.name} drafts off.`);
  return { busy, opening, save, connect, setDrafting };
}

export function ChannelCard({ c, demo }: { c: ChannelView; demo: boolean }) {
  const { busy, opening, save, connect, setDrafting } = useChannel(c, demo);
  const conn = c.connection;
  const state = !conn ? null : conn.status === "active" ? "Connected" : conn.status === "expiring" ? "Ending soon" : "Reconnect needed";
  return (
    <Card data-testid={`channel-${c.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{c.name}</CardTitle>
            <CardDescription>{c.blurb}</CardDescription>
          </div>
          {state ? <Badge variant={conn!.status === "active" ? "secondary" : "destructive"}>{state}</Badge> : <Badge variant="outline">Not connected</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {conn?.handle && <p className="text-muted-foreground">{demo ? "Demo mode: posts are recorded here, never sent." : `As ${conn.handle}`}</p>}
        {conn && c.id !== "linkedin" && (
          <label className="flex items-center justify-between gap-3">
            <span>Draft each post for {c.name} <span className="text-muted-foreground">(up to {c.maxChars} characters)</span></span>
            <Switch checked={conn.drafting} disabled={busy} aria-label={`Draft for ${c.name}`}
              onCheckedChange={setDrafting} />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {!c.connectable && !conn && <p className="text-muted-foreground">Not set up on this server yet.</p>}
          {c.connectable && (!conn || conn.status !== "active") && (
            <Button onClick={connect} disabled={busy || opening}>{opening ? `Opening ${c.name}…` : conn ? `Reconnect ${c.name}` : `Connect ${c.name}`}</Button>
          )}
          {conn && c.id !== "linkedin" && (
            <Button variant="ghost" disabled={busy} onClick={() => { if (confirm(`Disconnect ${c.name}? Posts already published stay on ${c.name}.`)) save(() => act.disconnect(c.id), `${c.name} disconnected.`); }}>Disconnect</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
