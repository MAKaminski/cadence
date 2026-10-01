import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import { escapeCommentary } from "@/engine/format";
import { PublishError, type MetricDetails, type Metrics, type PlatformAdapter } from "./types";
import { CORE_METRICS, LINKEDIN_METRICS, analyticsUrl, linkedinAnalytics, totalCount, type LinkedInMetric } from "./linkedin-analytics";

/** LinkedIn versions its API monthly and retires versions after about a year; bump this deliberately. */
export const LINKEDIN_VERSION = "202608";

export const linkedin: PlatformAdapter = {
  platform: "linkedin",
  async publish({ userId, accountId: authorUrn, text }) {
    const accessToken = await token(userId);
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
  // Member post analytics need LinkedIn's approval of r_member_postAnalytics (Community Management API).
  // Until the server opts in (LINKEDIN_ANALYTICS=1), numbers are entered by hand on Published instead
  // of guessed. One call per metric: the API returns one metric type per request.
  async fetchMetrics({ userId, externalId }) {
    if (!linkedinAnalytics()) return null;
    const accessToken = await token(userId);
    const read = async (metric: LinkedInMetric) => {
      const res = await fetch(analyticsUrl(externalId, metric), { headers: headers(accessToken), signal: AbortSignal.timeout(30_000) });
      if (res.status === 401 || res.status === 403) throw new AnalyticsRefused(res.status);
      if (!res.ok) return null;
      return totalCount(await res.json());
    };
    try {
      const got = await Promise.all((Object.keys(LINKEDIN_METRICS) as LinkedInMetric[]).map(async (m) => [m, await read(m)] as const));
      const n = Object.fromEntries(got) as Record<LinkedInMetric, number | null>;
      if (CORE_METRICS.some((m) => n[m] == null)) throw new Error("LinkedIn returned no post analytics for this post; it will be tried again at the next capture.");
      const details: MetricDetails = {};
      for (const [m, key] of Object.entries(LINKEDIN_METRICS)) {
        if (!CORE_METRICS.includes(m as LinkedInMetric) && n[m as LinkedInMetric] != null) details[key as keyof MetricDetails] = n[m as LinkedInMetric]!;
      }
      return { impressions: n.IMPRESSION!, reactions: n.REACTION!, comments: n.COMMENT!, reshares: n.RESHARE!, details } satisfies Metrics;
    } catch (e) {
      // The member's token predates the analytics scope (or LinkedIn hasn't approved it): not a retryable
      // fault. Reported as unavailable; signing in with LinkedIn again grants the scope.
      if (e instanceof AnalyticsRefused) { console.warn(`[linkedin] post analytics refused (${e.status}) for user ${userId}: reconnect LinkedIn to grant r_member_postAnalytics.`); return null; }
      throw e;
    }
  },
};

class AnalyticsRefused extends Error { constructor(readonly status: number) { super(`LinkedIn refused post analytics (${status}).`); } }

const headers = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" });

/** The member's LinkedIn token. Better Auth keeps it encrypted and decrypts it here, server-side only. */
async function token(userId: string): Promise<string> {
  const [acc] = await db.select({ id: account.id }).from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "linkedin"))).limit(1);
  if (!acc) throw new PublishError("No LinkedIn connection. Sign in with LinkedIn to connect.", true);
  const { accessToken } = await auth.api.getAccessToken({ body: { accountId: acc.id, userId } });
  return accessToken;
}
