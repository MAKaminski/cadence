// LinkedIn member post analytics (memberCreatorPostAnalytics): a post's numbers, read as the member who
// posted it. Needs the r_member_postAnalytics scope, which LinkedIn grants only to apps approved for the
// Community Management API; the server opts in with LINKEDIN_ANALYTICS=1 once it is. Pure helpers here,
// tested without a network (tests/linkedin-analytics.test.ts).
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics

/** True when this server's LinkedIn app is approved for post analytics and asks members for it. */
export const linkedinAnalytics = (env: Record<string, string | undefined> = process.env) => env.LINKEDIN_ANALYTICS === "1";

/** The scope that lets Cadence read a member's own post numbers. */
export const ANALYTICS_SCOPE = "r_member_postAnalytics";

/** What Cadence reads per post. The first five fill the metrics columns; the rest go in `details`. */
export const LINKEDIN_METRICS = {
  IMPRESSION: "impressions",
  REACTION: "reactions",
  COMMENT: "comments",
  RESHARE: "reshares",
  MEMBERS_REACHED: "membersReached",
  POST_SAVE: "saves",
  POST_SEND: "sends",
  LINK_CLICKS: "linkClicks",
  FOLLOWER_GAINED_FROM_CONTENT: "followersGained",
  PROFILE_VIEW_FROM_CONTENT: "profileViews",
} as const;
export type LinkedInMetric = keyof typeof LINKEDIN_METRICS;
/** Without these a snapshot isn't worth keeping; the others are best effort. */
export const CORE_METRICS: LinkedInMetric[] = ["IMPRESSION", "REACTION", "COMMENT", "RESHARE"];

/** The `entity` parameter in Rest.li 2.0 form: (share:urn%3Ali%3Ashare%3A…) or (ugc:urn%3Ali%3AugcPost%3A…). */
export function entityParam(urn: string): string {
  const m = /^urn:li:(share|ugcPost):\d+$/.exec(urn.trim());
  if (!m) throw new Error(`Not a LinkedIn post URN: ${urn}`);
  return `(${m[1] === "share" ? "share" : "ugc"}:${encodeURIComponent(urn.trim())})`;
}

/** Lifetime total for one metric of one post. */
export function analyticsUrl(urn: string, metric: LinkedInMetric): string {
  return `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${entityParam(urn)}&queryType=${metric}&aggregation=TOTAL`;
}

/** The count in a TOTAL response. metricType is a plain string from 202605 and an object before; only the count matters. */
export function totalCount(body: unknown): number | null {
  const els = (body as { elements?: { count?: unknown }[] } | null)?.elements;
  if (!Array.isArray(els)) return null;
  if (!els.length) return 0; // no activity yet
  const n = els.reduce((a, e) => a + (typeof e.count === "number" ? e.count : 0), 0);
  return Number.isFinite(n) ? n : null;
}
