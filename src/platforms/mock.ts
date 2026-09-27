import { randomUUID } from "node:crypto";
import type { Metrics, PlatformAdapter } from "./types";

/** Stable made-up numbers per post, growing with the post's age, so demo charts look like real ones. */
function sampleMetrics(externalId: string, publishedAt: Date): Metrics {
  let h = 0; for (const c of externalId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ageDays = Math.max(0.2, (Date.now() - publishedAt.getTime()) / 86_400_000);
  const grown = Math.min(1, 0.55 + ageDays / 6);
  const impressions = Math.round((700 + (h % 3800)) * grown);
  const rate = 0.012 + (h % 23) / 1000;
  return {
    impressions,
    reactions: Math.round(impressions * rate),
    comments: Math.round(impressions * rate * 0.18),
    reshares: Math.round(impressions * rate * 0.06),
    sample: true,
  };
}

/** Demo mode's publisher: records the post, sends nothing anywhere. */
export const mockPlatform: PlatformAdapter = {
  platform: "linkedin",
  async publish() {
    return { externalId: `urn:li:share:demo-${randomUUID().slice(0, 8)}` };
  },
  async fetchMetrics({ externalId, publishedAt }) {
    return sampleMetrics(externalId, publishedAt);
  },
};
