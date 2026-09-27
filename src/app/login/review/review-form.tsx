"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { continueOAuth, inOAuthFlow } from "@/lib/oauth-continue";

export function ReviewForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) { toast.error("That email and password don't match the review account."); return; }
      if (inOAuthFlow() && (await continueOAuth())) return;
      window.location.href = next;
    }); }}>
      <div className="flex flex-col gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
