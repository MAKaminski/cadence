// X API v2 calls that need only a token: posting and reading a post's numbers. No database or auth
// here, so they are tested against a stubbed fetch (tests/channels.test.ts).
import { PublishError, type Metrics } from "./types";

export const X_API = "https://api.x.com/2";

/** POST /2/tweets with a user token. Separate from the token lookup so it is tested on its own. */
export async function postToX(accessToken: string, text: string, fetcher: typeof fetch = fetch): Promise<{ externalId: string; url: string }> {
  let res: Response;
  try {
    res = await fetcher(`${X_API}/tweets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new PublishError(`No answer from X (${(e as Error).message}). The post may or may not be live.`, false);
  }
  if (res.status === 201 || res.status === 200) {
    const id = ((await res.json().catch(() => ({}))) as { data?: { id?: string } }).data?.id;
    if (!id) throw new PublishError("X accepted the post but returned no id. Check your X profile.", false);
    return { externalId: id, url: `https://x.com/i/web/status/${id}` };
  }
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 401) throw new PublishError("X access has ended. Reconnect X on Channels.", true);
  if (res.status === 429) throw new PublishError("X's posting limit was reached. Nothing was posted; approve it again later.", true);
  // 4xx (duplicate text, missing write permission, too long) means X refused: nothing was posted.
  throw new PublishError(`X answered ${res.status}: ${detail}`, res.status < 500);
}

export type PublicMetrics = { impression_count?: number; like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number };

/** X's public numbers mapped onto Cadence's four. Reshares are reposts plus quotes. */
export function metricsFromX(m: PublicMetrics): Metrics {
  return { impressions: m.impression_count ?? 0, reactions: m.like_count ?? 0, comments: m.reply_count ?? 0, reshares: (m.retweet_count ?? 0) + (m.quote_count ?? 0) };
}
