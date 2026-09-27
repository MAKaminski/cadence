/** A social platform Cadence can post to. LinkedIn is the only one today; a new platform is a new
 *  enum value in app-schema.ts plus one of these. */
export interface PlatformAdapter {
  platform: "linkedin";
  /** Publish plain text. Returns the platform's id for the post and a public URL if there is one. */
  publish(input: { userId: string; authorUrn: string; text: string }): Promise<{ externalId: string; url?: string }>;
  /** Current numbers for one post, or null when the platform won't share them (e.g. analytics access
   *  not granted yet). `sample` marks made-up demo numbers, which the UI always labels. */
  fetchMetrics(input: { userId: string; externalId: string; publishedAt: Date }): Promise<Metrics | null>;
}

export type Metrics = { impressions: number; reactions: number; comments: number; reshares: number; sample?: boolean };

/** `definite` = the platform clearly refused, so nothing was posted and it's safe to call it failed.
 *  Otherwise (timeouts, 5xx) the post may exist, and a person has to look. */
export class PublishError extends Error {
  constructor(message: string, readonly definite: boolean) { super(message); }
}
