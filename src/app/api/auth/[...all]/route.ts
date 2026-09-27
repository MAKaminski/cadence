import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Sign-in, sign-out, the LinkedIn callback, the Stripe webhook (/api/auth/stripe/webhook) and the OAuth
// server for assistants (/api/auth/oauth2/*) all live here.
const h = toNextJsHandler(auth);
export const GET = h.GET;

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;

/** Desktop and CLI MCP clients (Claude Code, Codex, Cursor, VS Code) register http loopback redirect
 *  URIs but often omit `application_type`, which then defaults to "web" and is rejected. A client whose
 *  every redirect is a loopback address is a native app by definition (RFC 8252 §7.3), so say so. */
export async function POST(req: Request) {
  if (!new URL(req.url).pathname.endsWith("/oauth2/register")) return h.POST(req);
  const body = (await req.clone().json().catch(() => null)) as { redirect_uris?: string[]; application_type?: string } | null;
  if (body && !body.application_type && body.redirect_uris?.length && body.redirect_uris.every((u) => LOOPBACK.test(u))) {
    return h.POST(new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ ...body, application_type: "native" }) }));
  }
  return h.POST(req);
}
