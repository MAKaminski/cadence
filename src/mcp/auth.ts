// Who is calling /api/mcp. Two kinds of credential are accepted:
//  - an OAuth access token (a JWT for the MCP resource) from Claude, Codex, Cursor or VS Code after the
//    user consents on /oauth/consent;
//  - a Cadence API key (`cad_…`), for clients configured with a header (Claude Code, Codex CLI).
import type { AuthInfo } from "@modelcontextprotocol/server";
import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";
import { auth, ISSUER, MCP_RESOURCE, API_LIMIT } from "@/lib/auth";
import { hasSubscription } from "@/services/account";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthConsent } from "@/db/schema";

const KEY_SCOPES: Record<string, string> = { read: "cadence:read", write: "cadence:write", approve: "cadence:approve" };

// Per-user request budget for tool calls, matching the API's per-key limit. In-process: exact on one
// web instance, per-instance if scaled out.
const buckets = new Map<string, { n: number; reset: number }>();
export function allow(userId: string, now = Date.now()) {
  const b = buckets.get(userId);
  if (!b || b.reset <= now) { buckets.set(userId, { n: 1, reset: now + API_LIMIT.windowMs }); return true; }
  return ++b.n <= API_LIMIT.max;
}

export async function verifyCaller(req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  let userId: string, scopes: string[], clientId: string, expiresAt: number | undefined;
  if (token.startsWith("cad_")) {
    const r = await auth.api.verifyApiKey({ body: { key: token } });
    if (!r.valid || !r.key) return undefined;
    userId = r.key.referenceId;
    scopes = (((r.key.permissions ?? {}) as Record<string, string[]>).cadence ?? ["read"]).map((s) => KEY_SCOPES[s]).filter(Boolean);
    clientId = `api-key:${r.key.id}`;
  } else {
    try {
      const p = await verifyAccessTokenRequest(requestToResourceInput(req), {
        verifyOptions: { issuer: ISSUER, audience: MCP_RESOURCE },
        jwksUrl: `${ISSUER}/jwks`,
      });
      if (!p.sub) return undefined;
      userId = p.sub;
      // Access tokens are stateless JWTs; checking the consent still exists makes "Disconnect" in
      // Settings take effect immediately rather than when the token expires.
      const azp = String(p.azp ?? p.client_id ?? "");
      const [consent] = await db.select({ id: oauthConsent.id }).from(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, azp))).limit(1);
      if (!consent) return undefined;
      scopes = String(p.scope ?? "").split(" ").filter((s) => s.startsWith("cadence:"));
      clientId = String(p.azp ?? p.client_id ?? "oauth");
      expiresAt = p.exp;
    } catch { return undefined; }
  }
  return { token, clientId, scopes, expiresAt, extra: { userId, scopes, subscribed: await hasSubscription(userId) } };
}
