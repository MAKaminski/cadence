"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function LinkedInButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const { error } = await authClient.signIn.social({ provider: "linkedin", callbackURL: "/app" });
      if (error) { toast.error(error.message ?? "LinkedIn sign-in failed. Try again."); setBusy(false); }
    }}>
      {busy ? "Opening LinkedIn…" : "Continue with LinkedIn"}
    </Button>
  );
}
