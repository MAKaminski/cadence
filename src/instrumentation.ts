// Runs once when the web server starts (Next.js instrumentation hook). It only reports configuration
// problems an operator must fix; it never stops the server, so email sign-in keeps working.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { linkedinWarning } = await import("@/lib/linkedin-config");
  const warning = linkedinWarning();
  if (warning) console.warn(warning);
}
