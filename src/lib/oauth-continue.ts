"use client";
import { authClient } from "@/lib/auth-client";

/** True when this page was reached from an assistant's "Connect Cadence" (a signed OAuth query). */
export const inOAuthFlow = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sig");

/** Resume the assistant's authorization after sign-in: on to the consent screen, or straight back to
 *  the assistant if the user already consented. */
export async function continueOAuth(): Promise<boolean> {
  const { data, error } = await authClient.oauth2.continue({ selected: true });
  const next = (data as { redirect_uri?: string; url?: string } | null)?.redirect_uri ?? (data as { url?: string } | null)?.url;
  if (error || !next) return false;
  window.location.href = next;
  return true;
}
