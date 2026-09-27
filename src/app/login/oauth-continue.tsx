"use client";
import { useEffect, useState } from "react";
import { continueOAuth } from "@/lib/oauth-continue";

/** Shown when a signed-in user lands on /login mid-connection (e.g. back from LinkedIn). */
export function OAuthContinue() {
  const [failed, setFailed] = useState(false);
  useEffect(() => { continueOAuth().then((ok) => !ok && setFailed(true)); }, []);
  return <p className="text-sm text-muted-foreground">{failed ? "That connection request expired. Start again from your assistant." : "Connecting your assistant…"}</p>;
}
