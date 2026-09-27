"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { createKey, revokeKey } from "@/lib/api-keys";

export type KeyRow = { id: string; name: string | null; start: string | null; scopes: string[]; lastUsed: string | null; createdAt: string };

export function ApiKeys({ keys }: { keys: KeyRow[] }) {
  const [name, setName] = useState("");
  const [write, setWrite] = useState(true);
  const [approve, setApprove] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-5">
      {shown && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" data-testid="new-key">
          <p className="font-medium">Copy your key now. It won't be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{shown}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shown); toast.success("Copied"); }}><Copy className="size-4" aria-hidden />Copy</Button>
          </div>
        </div>
      )}
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await createKey({ name, write, approve });
        if (!r.ok) { toast.error(r.error); return; }
        setShown(r.key); setName(""); setApprove(false);
      }); }}>
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="keyname">Key name</Label>
          <Input id="keyname" value={name} onChange={(e) => setName(e.target.value)} placeholder="laptop CLI" />
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2"><Checkbox checked disabled /> Read: status, setup, drafts, results</label>
          <label className="flex items-center gap-2"><Checkbox checked={write} onCheckedChange={(v) => setWrite(Boolean(v))} /> Write: check-ins, edits, skips, setup changes</label>
          <label className="flex items-start gap-2"><Checkbox className="mt-0.5" checked={approve} onCheckedChange={(v) => setApprove(Boolean(v))} />
            <span>Approve: lets this key approve drafts, which schedules them to post. <span className="text-muted-foreground">Only give this to tools you'd trust to post for you.</span></span>
          </label>
        </div>
        <div><Button type="submit" disabled={pending}><KeyRound className="size-4" aria-hidden />{pending ? "Creating…" : "Create key"}</Button></div>
      </form>
      {keys.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 p-3">
              <span className="font-medium">{k.name ?? "Unnamed"}</span>
              <code className="text-xs text-muted-foreground">{k.start}…</code>
              {k.scopes.map((s) => <Badge key={s} variant={s === "approve" ? "default" : "secondary"}>{s}</Badge>)}
              <span className="text-muted-foreground">{k.lastUsed ? `last used ${new Date(k.lastUsed).toLocaleString()}` : "never used"}</span>
              <Button className="ml-auto" size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
                const r = await revokeKey(k.id);
                if (r.ok) toast.success("Key revoked"); else toast.error(r.error ?? "Couldn't revoke");
              })}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
