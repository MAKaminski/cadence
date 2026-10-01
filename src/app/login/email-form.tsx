"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

/** Sign in or sign up with an emailed link. The same form does both: a new address creates an account. */
export function EmailForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm" role="status" data-testid="email-sent">
      <p className="font-medium">Check your inbox</p>
      <p className="text-muted-foreground">We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>. It works once and expires in 15 minutes.</p>
      <button type="button" className="self-start text-muted-foreground underline underline-offset-4" onClick={() => setSentTo(null)}>Use a different email</button>
    </div>
  );

  return (
    <form className="flex flex-col gap-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next ?? "/app" });
      setBusy(false);
      if (error) toast.error(error.status === 429 ? "Too many links requested. Wait a minute and try again." : error.message ?? "Could not send the link. Try again.");
      else setSentTo(email.trim());
    }}>
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" size="lg" className="w-full" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Email me a sign-in link"}</Button>
    </form>
  );
}
