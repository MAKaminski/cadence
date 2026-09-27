/** A social platform Cadence can post to. LinkedIn is the only one today; a new platform is a new
 *  enum value in app-schema.ts plus one of these. */
export interface PlatformAdapter {
  platform: "linkedin";
  /** Publish plain text. Returns the platform's id for the post and a public URL if there is one. */
  publish(input: { userId: string; authorUrn: string; text: string }): Promise<{ externalId: string; url?: string }>;
}

/** `definite` = the platform clearly refused, so nothing was posted and it's safe to call it failed.
 *  Otherwise (timeouts, 5xx) the post may exist, and a person has to look. */
export class PublishError extends Error {
  constructor(message: string, readonly definite: boolean) { super(message); }
}
