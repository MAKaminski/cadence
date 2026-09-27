"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function LinkedInButton({ next }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      // Mid-connection from an assistant, come back here (with the signed query) to finish connecting.
      const callbackURL = window.location.search.includes("sig=") ? `/login${window.location.search}` : next ?? "/app";
      const { error } = await authClient.signIn.social({ provider: "linkedin", callbackURL });
      if (error) { toast.error(error.message ?? "LinkedIn sign-in failed. Try again."); setBusy(false); }
    }}>
      {busy ? "Opening LinkedIn…" : "Continue with LinkedIn"}
    </Button>
  );
}
