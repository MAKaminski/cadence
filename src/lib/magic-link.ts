// Email sign-in helpers, kept pure so they are tested without a server (tests/magic-link.test.ts).
//
// The emailed link opens a Cadence page with a button, not the sign-in endpoint itself: mail scanners
// open links to check them, and a magic-link token works exactly once, so a link that signed you in
// on open would often be spent before you clicked it.

/** Set only inside the `pnpm signin:link` process (scripts/signin-link.mts): the link is handed to it
 *  instead of being emailed. The web server never sets it. */
export const magicLinkSink: { take?: (link: string) => void } = {};

/** Minutes an emailed sign-in link stays valid. */
export const MAGIC_LINK_MINUTES = 15;

/** A same-site path to land on after signing in, or /app. Never another origin. */
export function safeNext(raw: string | null | undefined, base = "http://x.invalid"): string {
  if (!raw) return "/app";
  try {
    const u = new URL(raw, base);
    if (u.origin !== new URL(base).origin || !/^\/[a-z]/.test(u.pathname)) return "/app";
    return u.pathname + u.search;
  } catch {
    return "/app";
  }
}

/** The page the email links to: it shows a button that spends the token. */
export function confirmUrl(base: string, token: string, next: string): string {
  const u = new URL("/login/email", base);
  u.searchParams.set("token", token);
  if (next !== "/app") u.searchParams.set("next", next);
  return u.toString();
}

/** Where that button goes: Better Auth's verify endpoint, landing on `next` or on /login with an error. */
export function verifyHref(token: string, next: string): string {
  const q = new URLSearchParams({ token, callbackURL: next, errorCallbackURL: "/login?error=link" });
  return `/api/auth/magic-link/verify?${q.toString()}`;
}

export function magicLinkEmail(link: string): { subject: string; text: string } {
  return {
    subject: "Your Cadence sign-in link",
    text: [
      "Here is your link to sign in to Cadence:",
      "",
      link,
      "",
      `It works once and expires in ${MAGIC_LINK_MINUTES} minutes. If you didn't ask for it, ignore this email: nobody can sign in without the link.`,
    ].join("\n"),
  };
}
