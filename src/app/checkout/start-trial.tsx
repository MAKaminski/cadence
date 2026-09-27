"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { startDemoTrial } from "@/lib/demo";

export function StartTrial({ plan, demo }: { plan: string; demo?: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (demo) return (
    <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await startDemoTrial();
      if (!r.ok) { toast.error(r.error); setBusy(false); return; }
      router.push("/onboarding");
    }}>{busy ? "Starting…" : "Start demo trial (no card)"}</Button>
  );
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
