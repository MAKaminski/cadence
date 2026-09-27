// Who is calling, for every bearer-authenticated front door (/api/v1 and /api/mcp). Two credentials:
//  - a Cadence API key (`cad_…`), scopes read / write / approve, rate limited by the api-key plugin;
//  - an OAuth access token (JWT) issued for exactly this resource, after the user consented. The consent
//    is re-checked on every call so Disconnect is immediate; limited by the per-user budget below.
import { and, eq } from "drizzle-orm";
import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";
import { db } from "@/db";
import { oauthConsent } from "@/db/schema";
import { auth, API_LIMIT, ISSUER } from "@/lib/auth";
import { hasSubscription } from "@/services/account";

export type Scope = "read" | "write" | "approve";
export type Caller = {
  userId: string; scopes: Scope[]; clientId: string; kind: "api_key" | "oauth"; subscribed: boolean; expiresAt?: number;
  /** For API keys: the plugin's limiter state, for RateLimit headers. */
  limit?: { max: number; remaining: number; resetSeconds: number };
};
export type Rejection = { status: 401 | 429; detail: string; retryAfter?: number };

const SCOPES: Scope[] = ["read", "write", "approve"];
const fromOAuth = (scope: string) => scope.split(" ").filter((s) => s.startsWith("cadence:")).map((s) => s.slice(8)).filter((s): s is Scope => (SCOPES as string[]).includes(s));

// Per-user budget for OAuth callers, the same size as an API key's. In-process: exact on one web
// instance, per-instance if scaled out.
const buckets = new Map<string, { n: number; reset: number }>();
export function allow(userId: string, now = Date.now()): { ok: boolean; remaining: number; resetSeconds: number } {
  let b = buckets.get(userId);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + API_LIMIT.windowMs }; buckets.set(userId, b); }
  b.n++;
  return { ok: b.n <= API_LIMIT.max, remaining: Math.max(0, API_LIMIT.max - b.n), resetSeconds: Math.ceil((b.reset - now) / 1000) };
}

/** Resolve a bearer credential for `audience` (the resource URL of the calling front door). */
export async function verifyBearer(req: Request, token: string | undefined, audience: string): Promise<Caller | Rejection> {
  if (!token) return { status: 401, detail: "Send `Authorization: Bearer …` with an API key or an OAuth access token." };

  if (token.startsWith("cad_")) {
    const r = await auth.api.verifyApiKey({ body: { key: token } });
    if (!r.valid || !r.key) {
      const e = r.error as { code?: string; details?: { tryAgainIn?: number } } | null;
      if (e?.code === "RATE_LIMITED") {
        const secs = Math.max(1, Math.ceil(Number(e.details?.tryAgainIn ?? API_LIMIT.windowMs) / 1000));
        return { status: 429, detail: `This key allows ${API_LIMIT.max} requests per minute.`, retryAfter: secs };
      }
      return { status: 401, detail: "That API key is invalid, expired or revoked." };
    }
    const k = r.key;
    const max = k.rateLimitMax ?? API_LIMIT.max;
    return {
      userId: k.referenceId, kind: "api_key", clientId: `api-key:${k.id}`,
      scopes: (((k.permissions ?? {}) as Record<string, string[]>).cadence ?? ["read"]).filter((s): s is Scope => (SCOPES as string[]).includes(s)),
      subscribed: await hasSubscription(k.referenceId),
      limit: { max, remaining: Math.max(0, max - (k.requestCount ?? 0)), resetSeconds: Math.ceil((k.rateLimitTimeWindow ?? API_LIMIT.windowMs) / 1000) },
    };
  }

  let p: Awaited<ReturnType<typeof verifyAccessTokenRequest>>;
  try {
    p = await verifyAccessTokenRequest(requestToResourceInput(req), { verifyOptions: { issuer: ISSUER, audience }, jwksUrl: `${ISSUER}/jwks` });
  } catch {
    return { status: 401, detail: "That access token is invalid, expired or not for this resource." };
  }
  const userId = String(p.sub ?? "");
  const clientId = String(p.azp ?? p.client_id ?? "");
  if (!userId) return { status: 401, detail: "That access token has no user." };
  const [consent] = await db.select({ id: oauthConsent.id }).from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId))).limit(1);
  if (!consent) return { status: 401, detail: "This app was disconnected. Sign in again to reconnect." };
  const budget = allow(userId);
  if (!budget.ok) return { status: 429, detail: `Up to ${API_LIMIT.max} requests per minute.`, retryAfter: budget.resetSeconds };
  return {
    userId, clientId, kind: "oauth", scopes: fromOAuth(String(p.scope ?? "")), expiresAt: p.exp,
    subscribed: await hasSubscription(userId),
    limit: { max: API_LIMIT.max, remaining: budget.remaining, resetSeconds: budget.resetSeconds },
  };
}

export const isRejection = (x: Caller | Rejection): x is Rejection => "status" in x;
