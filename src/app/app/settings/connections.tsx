"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { disconnect } from "@/lib/connections";

export type Connection = { clientId: string; name: string; scopes: string[]; since: string };

export function Connections({ items }: { items: Connection[] }) {
  const [pending, start] = useTransition();
  if (!items.length) return <p className="text-sm text-muted-foreground">No assistants connected. See <a className="underline" href="/integrations">Integrations</a> to add Cadence to Claude, Codex, Cursor or VS Code.</p>;
  return (
    <ul className="flex flex-col divide-y rounded-lg border text-sm" data-testid="connections">
      {items.map((c) => (
        <li key={c.clientId} className="flex flex-wrap items-center gap-2 p-3">
          <span className="font-medium">{c.name}</span>
          {c.scopes.filter((s) => s.startsWith("cadence:")).map((s) => <Badge key={s} variant={s.endsWith("approve") ? "default" : "secondary"}>{s.replace("cadence:", "")}</Badge>)}
          <span className="text-muted-foreground">since {new Date(c.since).toLocaleDateString()}</span>
          <Button className="ml-auto" size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await disconnect(c.clientId); toast.success(`${c.name} disconnected`); })}>Disconnect</Button>
        </li>
      ))}
    </ul>
  );
}
