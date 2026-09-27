// /api/mcp's view of the caller: the shared bearer verifier (src/lib/bearer.ts), with the MCP resource
// as audience, adapted to the MCP SDK's AuthInfo. Rate limiting happens inside verifyBearer.
import type { AuthInfo } from "@modelcontextprotocol/server";
import { MCP_RESOURCE } from "@/lib/auth";
import { isRejection, verifyBearer } from "@/lib/bearer";

export async function verifyCaller(req: Request, token?: string): Promise<AuthInfo | undefined> {
  const c = await verifyBearer(req, token, MCP_RESOURCE);
  if (isRejection(c)) {
    // A 429 must not look like a bad token (clients would re-authenticate), so it's surfaced as a
    // limited caller and turned into 429 by the route.
    if (c.status === 429) return { token: token!, clientId: "limited", scopes: [], extra: { limited: c.retryAfter ?? 60 } };
    return undefined;
  }
  const scopes = c.scopes.map((s) => `cadence:${s}`);
  return { token: token!, clientId: c.clientId, scopes, expiresAt: c.expiresAt, extra: { userId: c.userId, scopes, subscribed: c.subscribed } };
}
