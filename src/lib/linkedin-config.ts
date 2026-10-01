// Is "Continue with LinkedIn" safe to show? A server whose LinkedIn app ID is empty or a placeholder
// would send people to LinkedIn's own error page ("The passed in client_id is invalid"). Until real
// keys are set, the app hides LinkedIn and says why; email sign-in and drafting keep working.
import { isDemo } from "./mode";

/** Values that mean "not filled in yet" (deploy templates, CI and Docker build placeholders). */
const PLACEHOLDERS = new Set(["preview", "build", "ci", "test", "changeme", "change-me", "placeholder", "todo", "xxx", "none", "null"]);
/** LinkedIn client IDs are letters and digits, at least 10 of them (e.g. 14 like "78abcd1efgh2ij"). */
const SHAPE = /^[A-Za-z0-9]{10,}$/;

export function linkedinIdLooksReal(id: string | undefined): boolean {
  const v = (id ?? "").trim();
  return v.length > 0 && !PLACEHOLDERS.has(v.toLowerCase()) && SHAPE.test(v);
}

/** True when sign-in and publishing through LinkedIn can work here. Demo mode uses a stand-in. */
export function linkedinConfigured(env: Record<string, string | undefined> = process.env): boolean {
  if (isDemo()) return true;
  return linkedinIdLooksReal(env.LINKEDIN_CLIENT_ID) && Boolean((env.LINKEDIN_CLIENT_SECRET ?? "").trim())
    && !PLACEHOLDERS.has((env.LINKEDIN_CLIENT_SECRET ?? "").trim().toLowerCase());
}

/** What to tell the operator, once, when LinkedIn isn't set up. Never includes the values. */
export function linkedinWarning(env: Record<string, string | undefined> = process.env): string | null {
  if (linkedinConfigured(env)) return null;
  const base = (env.BETTER_AUTH_URL ?? "https://YOUR_DOMAIN").replace(/\/$/, "");
  return [
    "[cadence] LinkedIn is not configured: LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are missing or placeholders.",
    "  LinkedIn sign-in and publishing are hidden until they are set (deploy/.env on the server).",
    `  In the LinkedIn developer app, the authorized redirect URL must be ${base}/api/auth/callback/linkedin`,
  ].join("\n");
}
