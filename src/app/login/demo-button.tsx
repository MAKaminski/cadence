"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { continueOAuth, inOAuthFlow } from "@/lib/oauth-continue";

/** Demo mode only (localhost / CI): sign in as a throwaway demo user, no LinkedIn needed. */
export function DemoButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button size="lg" variant="outline" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const { error } = await authClient.signIn.anonymous();
      if (error) { toast.error(error.message ?? "Demo sign-in failed."); setBusy(false); return; }
      if (inOAuthFlow() && (await continueOAuth())) return;
      router.push("/checkout");
    }}>{busy ? "Starting demo…" : "Continue as demo user"}</Button>
  );
}
