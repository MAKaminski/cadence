"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function StartTrial({ plan }: { plan: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const { error } = await authClient.subscription.upgrade({ plan, successUrl: "/onboarding", cancelUrl: "/checkout" });
      if (error) { toast.error(error.message ?? "Couldn't open checkout. Try again."); setBusy(false); }
    }}>
      {busy ? "Opening secure checkout…" : "Add card and start free trial"}
    </Button>
  );
}
