"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Connects (or renews) LinkedIn on the signed-in account. One consent covers identity and posting. */
export function ConnectLinkedIn({ label = "Connect LinkedIn", back = "/app/settings", variant = "outline" }: { label?: string; back?: string; variant?: "default" | "outline" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant={variant} disabled={busy} onClick={async () => {
      setBusy(true);
      const { error } = await authClient.linkSocial({ provider: "linkedin", callbackURL: back });
      if (error) { toast.error(error.message ?? "Could not open LinkedIn. Try again."); setBusy(false); }
    }}>
      {busy ? "Opening LinkedIn…" : label}
    </Button>
  );
}
