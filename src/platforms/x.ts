// X (formerly Twitter): posts through the X API v2 as the connected account. The OAuth 2.0 user token
// (scopes tweet.write, tweet.read, users.read, offline.access) lives encrypted in Better Auth's
// `account` row and is refreshed there; this file only uses it.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import { PublishError, type PlatformAdapter } from "./types";
import { metricsFromX, postToX, X_API, type PublicMetrics } from "./x-api";

async function token(userId: string): Promise<string> {
  const [acc] = await db.select({ id: account.id }).from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "twitter"))).limit(1);
  if (!acc) throw new PublishError("No X connection. Connect X on Channels.", true);
  try {
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: acc.id, userId } });
    if (!accessToken) throw new Error("no token");
    return accessToken;
  } catch {
    throw new PublishError("X access has ended. Reconnect X on Channels.", true);
  }
}

export const x: PlatformAdapter = {
  platform: "x",
  async publish({ userId, text }) {
    return postToX(await token(userId), text);
  },
  async fetchMetrics({ userId, externalId }) {
    const res = await fetch(`${X_API}/tweets/${encodeURIComponent(externalId)}?tweet.fields=public_metrics`, {
      headers: { Authorization: `Bearer ${await token(userId)}` }, signal: AbortSignal.timeout(30_000),
    });
    // 403: the server's X plan doesn't include reading posts. Reported as unavailable, not guessed.
    if (res.status === 403) return null;
    if (!res.ok) throw new Error(`X answered ${res.status} for post metrics.`);
    const body = (await res.json()) as { data?: { public_metrics?: PublicMetrics } };
    return body.data?.public_metrics ? metricsFromX(body.data.public_metrics) : null;
  },
};
