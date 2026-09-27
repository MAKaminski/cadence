"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMyAccount } from "@/lib/account-actions";

export function DeleteAccount() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Cancels your subscription immediately and deletes your setup, drafts, records of posts, results, API keys, connected
        assistants and your LinkedIn connection. Posts already on LinkedIn stay there. This can't be undone.
      </p>
      <label htmlFor="confirm-delete">Type <span className="font-mono">delete my account</span> to confirm</label>
      <div className="flex flex-wrap gap-2">
        <Input id="confirm-delete" className="max-w-xs" value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="destructive" disabled={pending || text !== "delete my account"} onClick={() => start(async () => {
          const r = await deleteMyAccount(text);
          if (!r.ok) { toast.error(r.error ?? "Couldn't delete the account."); return; }
          window.location.assign(new URL("/?deleted=1", window.location.origin).href); // full reload: the session is gone
        })}>{pending ? "Deleting…" : "Delete account"}</Button>
      </div>
    </div>
  );
}
