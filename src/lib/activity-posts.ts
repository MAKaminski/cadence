// A person's best-performing posts, for setup's voice samples. LinkedIn's export has post text but no
// numbers, and its API keeps both behind partner scopes, so the numbers come from what the person can see:
// their Activity page (linkedin.com/in/me/recent-activity/all/), selected and copied as text. Each post
// there carries its reactions, comments and reposts. Pure and client-safe; tolerant of LinkedIn's layout.

export type RankedPost = {
  text: string;
  reactions: number | null; comments: number | null; reposts: number | null; impressions?: number | null;
  /** reactions + 2 × comments + 3 × reposts, or null when the source has no numbers. */
  score: number | null;
  source: "activity" | "cadence" | "export";
  date?: string;
};

export const MIN_POST_CHARS = 80;

/** Comments and reposts spread a post further than a reaction does, so they count for more. */
export function score(p: { reactions: number | null; comments: number | null; reposts: number | null }): number | null {
  if (p.reactions == null && p.comments == null && p.reposts == null) return null;
  return (p.reactions ?? 0) + 2 * (p.comments ?? 0) + 3 * (p.reposts ?? 0);
}

/** "1,204", "1.2K", "3M" → a number. */
export function count(s: string): number | null {
  const m = s.trim().match(/^([\d,]*\.?\d+)\s*([KkMm])?$/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Math.round(n * (m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1));
}

const NUM = String.raw`([\d,]*\.?\d+\s*[KkMm]?)`;
const COMMENTS = new RegExp(String.raw`^${NUM}\s+comments?$`, "i");
const REPOSTS = new RegExp(String.raw`^${NUM}\s+(reposts?|shares?)$`, "i");
const OTHERS = new RegExp(String.raw`^.+\sand\s${NUM}\s+others?$`, "i");
const BARE = new RegExp(String.raw`^${NUM}$`);
// Lines that are the page, not the post.
const CHROME = /^(like|comment|repost|send|share|follow|following|\+ follow|…\s*(see )?more|\.\.\.\s*(see )?more|see more|see translation|activate to view larger image,?|image|video|play|pause|loaded:.*|edited|reactions?|•\s*you|you|•\s*\d+(st|nd|rd|th)\+?|show translation|load more comments|no comments yet\.?)$/i;
// The line that ends a post's header: its age ("2w •", "3 days ago") or its visibility.
const AGE = /(^|\s)\d+\s?(s|m|h|d|w|mo|yr|y)\s*•|\bvisible to (anyone|connections)|\b\d+\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i;
const NOT_OWN = /\b(reposted|commented on|likes|liked|celebrates|supports|loves|finds this (funny|insightful)|replied to)\b.*\bthis\b|\breposted this\b/i;

/** Split the copied Activity page into one chunk per feed item. */
function chunks(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const starts: number[] = [];
  lines.forEach((l, i) => { if (/^feed post( number \d+)?$/i.test(l)) starts.push(i); });
  if (!starts.length) {
    // No item markers: each item has exactly one age line; split just above the name lines before it.
    lines.forEach((l, i) => { if (AGE.test(l)) starts.push(Math.max(0, i - 3)); });
  }
  if (!starts.length) return [lines];
  return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length));
}

/** Posts with their numbers, from pasted Activity page text. Reposts of other people's posts are left out. */
export function parseActivity(text: string): RankedPost[] {
  const out: RankedPost[] = [];
  for (const c of chunks(text)) {
    if (c.slice(0, 6).some((l) => NOT_OWN.test(l))) continue;
    let reactions: number | null = null, comments: number | null = null, reposts: number | null = null;
    // The body runs from after the age line to the first line of numbers or buttons.
    // The header can carry two such lines ("2w •", then "2 weeks ago • Visible to anyone"): take the last.
    let age = -1;
    c.slice(0, 10).forEach((l, i) => { if (AGE.test(l)) age = i; });
    const body: string[] = [];
    let ended = false;
    for (let i = age >= 0 ? age + 1 : 0; i < c.length; i++) {
      const l = c[i];
      let m: RegExpMatchArray | null;
      if ((m = l.match(COMMENTS))) { comments = count(m[1]); ended = true; continue; }
      if ((m = l.match(REPOSTS))) { reposts = count(m[1]); ended = true; continue; }
      if ((m = l.match(OTHERS))) { reactions = (count(m[1]) ?? 0) + 1; ended = true; continue; }
      if ((m = l.match(BARE))) { if (reactions == null) reactions = count(m[1]); ended = true; continue; }
      if (CHROME.test(l)) { if (/^(like|comment|repost|send)$/i.test(l)) ended = true; continue; }
      if (!ended) body.push(l);
    }
    const post = body.join("\n").replace(/\n{3,}/g, "\n\n").replace(/…\s*(see )?more$/i, "").trim();
    if (post.length < MIN_POST_CHARS) continue;
    const p = { text: post, reactions, comments, reposts };
    out.push({ ...p, score: score(p), source: "activity" });
  }
  return out;
}

const norm = (s: string) => s.replace(/…\s*(see )?more/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** True when `post` appears word for word in `source` (spacing aside): a sample must be the person's own words. */
export const isVerbatim = (source: string, post: string) => norm(post).length >= MIN_POST_CHARS / 2 && norm(source).includes(norm(post));

const key = (s: string) => norm(s).slice(0, 80);

/** Scored posts first, highest score first; then unscored ones, longest first. Duplicates (same opening) once. */
export function rankPosts(posts: RankedPost[]): RankedPost[] {
  const seen = new Set<string>();
  const unique = posts.filter((p) => p.text.length >= MIN_POST_CHARS && !seen.has(key(p.text)) && seen.add(key(p.text)));
  return unique.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.score == null && b.score == null ? b.text.length - a.text.length : 0));
}

/** "120 reactions · 15 comments · 4 reposts" for a card. */
export function numbersLine(p: RankedPost): string {
  const part = (n: number | null | undefined, one: string) => (n == null ? null : `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`);
  return [part(p.impressions, "impression"), part(p.reactions, "reaction"), part(p.comments, "comment"), part(p.reposts, "repost")].filter(Boolean).join(" · ");
}
