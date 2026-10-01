// Runs once when the web server starts (Next.js instrumentation hook). It only reports configuration
// problems an operator must fix; it never stops the server, so whatever sign-in does work keeps working.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isDemo } = await import("@/lib/mode");
  if (isDemo()) return; // demo mode stands in for every outside service
  const { setupWarning } = await import("@/lib/setup-check");
  const warning = setupWarning(process.env);
  if (warning) console.warn(warning);
}
