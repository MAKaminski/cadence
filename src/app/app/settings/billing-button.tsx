"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function BillingButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      const { error } = await authClient.subscription.billingPortal({ returnUrl: "/app/settings" });
      if (error) { toast.error(error.message ?? "Couldn't open billing. Try again."); setBusy(false); }
    }}>{busy ? "Opening…" : "Manage billing or cancel"}</Button>
  );
}
