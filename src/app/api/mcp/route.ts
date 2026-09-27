import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerCadence } from "@/mcp/server";
import { verifyCaller } from "@/mcp/auth";

const mcp = createMcpHandler(registerCadence, { serverInfo: { name: "cadence", version: "0.5.0" } });

const guarded = async (req: Request) => {
  const extra = req.auth?.extra as { userId?: string; subscribed?: boolean; limited?: number } | undefined;
  if (extra?.limited) return Response.json({ error: "rate_limited", error_description: "Too many requests; try again shortly." }, { status: 429, headers: { "Retry-After": String(extra.limited) } });
  if (extra && !extra.subscribed) return Response.json({ error: "subscription_required", error_description: "This Cadence account has no active trial or subscription." }, { status: 402 });
  return mcp(req);
};

// 401s carry a WWW-Authenticate challenge pointing at /.well-known/oauth-protected-resource, which is
// how Claude and other clients discover where to sign in.
const handler = withMcpAuth(guarded, verifyCaller, { required: true, resourceUrl: process.env.BETTER_AUTH_URL });
export { handler as GET, handler as POST, handler as DELETE };
