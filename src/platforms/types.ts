import type { PlatformId } from "./registry";

/** A social platform Cadence can post to. Each live channel in ./registry.ts has one of these. */
export interface PlatformAdapter {
  platform: PlatformId;
  /** Publish plain text as the connected account (`accountId` is platform_accounts.external_id).
   *  Returns the platform's id for the post and a public URL if there is one. */
  publish(input: { userId: string; accountId: string; text: string }): Promise<{ externalId: string; url?: string }>;
  /** Current numbers for one post, or null when the platform won't share them (e.g. analytics access
   *  not granted yet). `sample` marks made-up demo numbers, which the UI always labels. */
  fetchMetrics(input: { userId: string; externalId: string; publishedAt: Date }): Promise<Metrics | null>;
}

export type Metrics = { impressions: number; reactions: number; comments: number; reshares: number; sample?: boolean; details?: MetricDetails };
/** Numbers some platforms add (LinkedIn's post analytics): kept in metrics.platform_data.details. */
export type MetricDetails = Partial<Record<"membersReached" | "saves" | "sends" | "linkClicks" | "followersGained" | "profileViews", number>>;

/** `definite` = the platform clearly refused, so nothing was posted and it's safe to call it failed.
 *  Otherwise (timeouts, 5xx) the post may exist, and a person has to look. */
export class PublishError extends Error {
  constructor(message: string, readonly definite: boolean) { super(message); }
}
