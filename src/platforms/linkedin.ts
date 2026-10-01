import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import { escapeCommentary } from "@/engine/format";
import { PublishError, type PlatformAdapter } from "./types";

/** LinkedIn versions its API monthly and retires versions after about a year; bump this deliberately. */
export const LINKEDIN_VERSION = "202608";

export const linkedin: PlatformAdapter = {
  platform: "linkedin",
  async publish({ userId, accountId: authorUrn, text }) {
    // Better Auth keeps the token encrypted and decrypts it here, server-side only.
    const [acc] = await db.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "linkedin"))).limit(1);
    if (!acc) throw new PublishError("No LinkedIn connection. Sign in with LinkedIn to connect.", true);
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: acc.id, userId } });
    let res: Response;
    try {
      res = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: authorUrn,
          commentary: escapeCommentary(text),
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new PublishError(`No answer from LinkedIn (${(e as Error).message}). The post may or may not be live.`, false);
    }
    if (res.status === 201) {
      const id = res.headers.get("x-restli-id") ?? "";
      return { externalId: id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined };
    }
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 401) throw new PublishError("LinkedIn access has expired. Sign in again to reconnect.", true);
    throw new PublishError(`LinkedIn answered ${res.status}: ${detail}`, res.status < 500);
  },
  // Member post analytics need LinkedIn's approval of r_member_postAnalytics. Until the app has it
  // (LINKEDIN_ANALYTICS=1), results are reported as unavailable rather than guessed.
  async fetchMetrics() {
    if (process.env.LINKEDIN_ANALYTICS !== "1") return null;
    throw new Error("LinkedIn analytics is enabled but not implemented yet; see the v0.3 plan.");
  },
};
