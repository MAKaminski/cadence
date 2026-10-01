import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsUrl, entityParam, totalCount } from "@/platforms/linkedin-analytics";

describe("LinkedIn post analytics: request and response", () => {
  it("encodes share and ugcPost URNs the way memberCreatorPostAnalytics wants them", () => {
    expect(entityParam("urn:li:share:1234")).toBe("(share:urn%3Ali%3Ashare%3A1234)");
    expect(entityParam("urn:li:ugcPost:5678")).toBe("(ugc:urn%3Ali%3AugcPost%3A5678)");
    expect(() => entityParam("urn:li:person:abc")).toThrow();
    expect(analyticsUrl("urn:li:share:1", "IMPRESSION")).toBe(
      "https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=(share:urn%3Ali%3Ashare%3A1)&queryType=IMPRESSION&aggregation=TOTAL");
  });

  it("reads the count from both response shapes (metricType as a string from 202605, an object before)", () => {
    expect(totalCount({ elements: [{ count: 1204, metricType: "IMPRESSION", targetEntity: { share: "urn:li:share:1" } }] })).toBe(1204);
    expect(totalCount({ elements: [{ count: 7, metricType: { "com.linkedin.adsexternalapi.memberanalytics.v1.CreatorPostAnalyticsMetricTypeV1": "REACTION" } }] })).toBe(7);
    expect(totalCount({ elements: [] })).toBe(0);
    expect(totalCount({ message: "nope" })).toBeNull();
  });
});

describe("LinkedIn adapter fetchMetrics", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); delete process.env.LINKEDIN_ANALYTICS; });

  async function adapter(respond: (metric: string) => Response) {
    vi.doMock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "acc" }] }) }) }) } }));
    vi.doMock("@/lib/auth", () => ({ auth: { api: { getAccessToken: async () => ({ accessToken: "tok" }) } } }));
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      const metric = new URL(url).searchParams.get("queryType")!;
      calls.push(metric);
      return respond(metric);
    });
    const { linkedin } = await import("@/platforms/linkedin");
    return { linkedin, calls };
  }
  const json = (count: number) => new Response(JSON.stringify({ elements: [{ count, metricType: "X" }] }), { status: 200 });
  const input = { userId: "u", externalId: "urn:li:share:42", publishedAt: new Date() };

  it("stays off (no LinkedIn calls) until LINKEDIN_ANALYTICS=1", async () => {
    const { linkedin, calls } = await adapter(() => json(1));
    expect(await linkedin.fetchMetrics(input)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("reads every metric: the four columns plus reach, saves, sends, clicks, followers and profile views", async () => {
    process.env.LINKEDIN_ANALYTICS = "1";
    const counts: Record<string, number> = { IMPRESSION: 1500, REACTION: 40, COMMENT: 6, RESHARE: 2, MEMBERS_REACHED: 900, POST_SAVE: 3, POST_SEND: 1, LINK_CLICKS: 12, FOLLOWER_GAINED_FROM_CONTENT: 4, PROFILE_VIEW_FROM_CONTENT: 9 };
    const { linkedin, calls } = await adapter((m) => json(counts[m]));
    expect(await linkedin.fetchMetrics(input)).toEqual({
      impressions: 1500, reactions: 40, comments: 6, reshares: 2,
      details: { membersReached: 900, saves: 3, sends: 1, linkClicks: 12, followersGained: 4, profileViews: 9 },
    });
    expect(calls).toHaveLength(10);
  });

  it("keeps the core numbers when an extra metric isn't available", async () => {
    process.env.LINKEDIN_ANALYTICS = "1";
    const { linkedin } = await adapter((m) => m === "LINK_CLICKS" ? new Response("{}", { status: 400 }) : json(5));
    const m = await linkedin.fetchMetrics(input);
    expect(m?.impressions).toBe(5);
    expect(m?.details).not.toHaveProperty("linkClicks");
  });

  it("reports unavailable (not an error) when LinkedIn refuses the scope", async () => {
    process.env.LINKEDIN_ANALYTICS = "1";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { linkedin } = await adapter(() => new Response("{}", { status: 403 }));
    expect(await linkedin.fetchMetrics(input)).toBeNull();
  });

  it("fails the capture (so it is retried) when a core number is missing", async () => {
    process.env.LINKEDIN_ANALYTICS = "1";
    const { linkedin } = await adapter((m) => m === "IMPRESSION" ? new Response("oops", { status: 500 }) : json(1));
    await expect(linkedin.fetchMetrics(input)).rejects.toThrow(/no post analytics/);
  });
});
