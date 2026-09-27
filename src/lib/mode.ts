// Demo mode swaps every outside service for a local stand-in: an anonymous sign-in instead of
// LinkedIn, a no-card trial instead of Stripe, a template writer instead of Claude, and a publisher
// that records posts instead of sending them. It exists so anyone can run the whole product with no
// keys, and so the demo video and CI smoke test exercise the real code paths.
//
// It is refused anywhere but a local machine or CI: an anonymous sign-in on a public server would be
// a way in without an account. Every demo-only route calls requireDemo() at request time.

function localUrl(url: string | undefined) {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch { return false; }
}

export function isDemo(): boolean {
  return process.env.CADENCE_DEMO === "1" && (localUrl(process.env.BETTER_AUTH_URL) || process.env.CI === "true");
}

export function requireDemo(): void {
  if (!isDemo()) throw new Error("Demo mode is only available on localhost or in CI.");
}

/** Test hook for the publish-safety test: crash right after the platform accepts a post. */
export const FAULT = () => process.env.CADENCE_FAULT;
