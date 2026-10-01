// What this server can and can't do for sign-in, from its settings alone. Pure (tests/setup-check.test.ts),
// so the login page, the start-up log and `pnpm signin:check` all say the same thing. Names settings, never values.
import { linkedinConfigured } from "./linkedin-config";

export type Check = {
  /** The settings this line is about, as named in deploy/.env. */
  keys: string;
  ok: boolean;
  /** error: nobody can sign in, or sign-in breaks. warn: one way in, or a later step, is missing. */
  level: "error" | "warn";
  /** What works, or what to set and why. */
  note: string;
};

type Env = Record<string, string | undefined>;
const set = (v: string | undefined) => Boolean((v ?? "").trim());

export function emailConfigured(env: Env): boolean {
  return set(env.RESEND_API_KEY) && /@[^@\s>]+\.[^@\s>]+/.test(env.EMAIL_FROM ?? "");
}

/** Every setting sign-in depends on, in the order an operator should fix them. */
export function setupChecks(env: Env): Check[] {
  const url = (env.BETTER_AUTH_URL ?? "").trim();
  let host = "";
  try { host = new URL(url).host; } catch { /* reported below */ }
  const linkedin = linkedinConfigured(env);
  const email = emailConfigured(env);
  const domain = (env.DOMAIN ?? "").trim();
  return [
    {
      keys: "BETTER_AUTH_URL", level: "error",
      ok: url.startsWith("https://") && Boolean(host) && (!domain || host === domain),
      note: !host ? "Set it to https://YOUR_DOMAIN. Sign-in links, cookies and redirects are built from it."
        : !url.startsWith("https://") ? "Must start with https:// on a public server, or the session cookie is refused."
        : domain && host !== domain ? `Its host must be DOMAIN exactly (${domain}); otherwise sign-in redirects and cookies go to the wrong site.`
        : `Sign-in runs at ${url.replace(/\/$/, "")}.`,
    },
    {
      keys: "BETTER_AUTH_SECRET", level: "error", ok: (env.BETTER_AUTH_SECRET ?? "").length >= 32,
      note: (env.BETTER_AUTH_SECRET ?? "").length >= 32 ? "Set." : "Needs 32+ characters. Generate once with: openssl rand -base64 48",
    },
    {
      keys: "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET", level: "warn", ok: linkedin,
      note: linkedin ? `"Continue with LinkedIn" is on. Its redirect URL must be ${url.replace(/\/$/, "") || "https://YOUR_DOMAIN"}/api/auth/callback/linkedin.`
        : "Missing or a placeholder (e.g. \"preview\"): LinkedIn sign-in and publishing are hidden. Copy both from your LinkedIn app's Auth tab.",
    },
    {
      keys: "RESEND_API_KEY, EMAIL_FROM", level: "warn", ok: email,
      note: email ? "Email sign-in links are on." : "Not set: no email sign-in. Add a Resend API key and a sender on a domain verified in Resend, e.g. Cadence <hello@YOUR_DOMAIN>.",
    },
    {
      keys: "Sign-in method", level: "error", ok: linkedin || email,
      note: linkedin || email ? [linkedin && "LinkedIn", email && "email"].filter(Boolean).join(" and ") + " sign-in available."
        : "Nobody can sign in: set the LinkedIn keys or the Resend settings above (or both).",
    },
    {
      keys: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID", level: "warn",
      ok: (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_") && (env.STRIPE_WEBHOOK_SECRET ?? "").startsWith("whsec_") && (env.STRIPE_PRICE_ID ?? "").startsWith("price_"),
      note: "Needed after sign-in: a new account starts its trial at /checkout through Stripe, so without these it stops there.",
    },
  ];
}

/** The settings to name on the login page when nobody can sign in. */
export function missingSignInKeys(env: Env): string[] {
  return setupChecks(env).filter((c) => !c.ok && (c.keys.startsWith("LINKEDIN") || c.keys.startsWith("RESEND"))).map((c) => c.keys);
}

/** One report for the operator: problems only, or null when everything is set. */
export function setupWarning(env: Env): string | null {
  const bad = setupChecks(env).filter((c) => !c.ok);
  if (!bad.length) return null;
  return ["[cadence] Sign-in settings to fix in deploy/.env (run `pnpm signin:check` for the full list):",
    ...bad.map((c) => `  ${c.level === "error" ? "ERROR" : "warn "} ${c.keys}: ${c.note}`)].join("\n");
}
