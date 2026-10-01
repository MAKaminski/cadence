// Every channel Cadence knows, live or planned, in one place. A channel goes live with one entry here
// (status "live"), one adapter in src/platforms/, and its sign-in provider in src/lib/auth.ts. The
// Channels page, drafting, publishing and Results all read this list.
//
// Keys: every channel connects in one click through Cadence's own developer app (the operator sets its
// keys once in deploy/.env). People never bring their own API keys: none of these platforms needs one
// per user, and Bluesky and Mastodon need no app keys at all.
import { isDemo } from "@/lib/mode";
import { LIMITS } from "@/lib/catalog";
import { linkedinConfigured } from "@/lib/linkedin-config";

export type PlatformId =
  | "linkedin" | "x" | "threads" | "bluesky" | "mastodon" | "facebook"
  | "instagram" | "pinterest" | "tiktok" | "youtube" | "reddit" | "google_business";

export type PlatformSpec = {
  id: PlatformId;
  name: string;
  status: "live" | "planned";
  /** The Better Auth provider that connects it (account.provider_id). */
  provider: string;
  /** Operator settings the server needs before the Connect button appears. */
  env: string[];
  /** How a post's length is measured and capped. */
  limits: { hardChars: number; targetChars: number; hookChars: number; maxHashtags: number; count: "chars" | "x" };
  /** A post can't be text alone (Instagram, Pinterest, TikTok, YouTube). */
  needsMedia: boolean;
  /** What a person sees on the Channels page about this channel. */
  blurb: string;
  postUrl?: (externalId: string) => string;
};

const PLAIN = { maxHashtags: 3, count: "chars" as const };

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "linkedin", name: "LinkedIn", status: "live", provider: "linkedin", env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    limits: { hardChars: LIMITS.hardChars, targetChars: LIMITS.targetChars, hookChars: LIMITS.hookChars, maxHashtags: LIMITS.maxHashtags, count: "chars" }, needsMedia: false,
    blurb: "Your main channel: every check-in becomes LinkedIn drafts.",
    postUrl: (id) => `https://www.linkedin.com/feed/update/${id}/`,
  },
  {
    id: "x", name: "X", status: "live", provider: "twitter", env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    // X counts a link as 23 and most emoji and CJK characters as 2 (see xLength below).
    limits: { hardChars: 280, targetChars: 260, hookChars: 280, maxHashtags: 2, count: "x" }, needsMedia: false,
    blurb: "Each LinkedIn draft gets a short X version that fits in one post.",
    postUrl: (id) => `https://x.com/i/web/status/${id}`,
  },
  { id: "threads", name: "Threads", status: "planned", provider: "threads", env: ["THREADS_APP_ID", "THREADS_APP_SECRET"], limits: { hardChars: 500, targetChars: 450, hookChars: 500, ...PLAIN }, needsMedia: false, blurb: "Short text posts through Meta's Threads API." },
  { id: "bluesky", name: "Bluesky", status: "planned", provider: "bluesky", env: [], limits: { hardChars: 300, targetChars: 280, hookChars: 300, ...PLAIN }, needsMedia: false, blurb: "Short posts. Connects with Bluesky's own sign-in; no app keys needed." },
  { id: "mastodon", name: "Mastodon", status: "planned", provider: "mastodon", env: [], limits: { hardChars: 500, targetChars: 450, hookChars: 500, ...PLAIN }, needsMedia: false, blurb: "Any server: Cadence registers itself with yours when you connect." },
  { id: "facebook", name: "Facebook", status: "planned", provider: "facebook", env: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"], limits: { hardChars: 63206, targetChars: 1300, hookChars: 140, ...PLAIN }, needsMedia: false, blurb: "Posts to a Facebook Page you manage (Meta doesn't allow posting to personal profiles)." },
  { id: "instagram", name: "Instagram", status: "planned", provider: "instagram", env: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"], limits: { hardChars: 2200, targetChars: 1200, hookChars: 125, maxHashtags: 5, count: "chars" }, needsMedia: true, blurb: "Professional accounts; every post needs an image or video." },
  { id: "pinterest", name: "Pinterest", status: "planned", provider: "pinterest", env: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"], limits: { hardChars: 500, targetChars: 300, hookChars: 100, maxHashtags: 0, count: "chars" }, needsMedia: true, blurb: "Pins need an image; the post becomes its description." },
  { id: "tiktok", name: "TikTok", status: "planned", provider: "tiktok", env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], limits: { hardChars: 2200, targetChars: 300, hookChars: 100, maxHashtags: 5, count: "chars" }, needsMedia: true, blurb: "Video or photo posts; the post becomes the caption." },
  { id: "youtube", name: "YouTube", status: "planned", provider: "google", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], limits: { hardChars: 5000, targetChars: 1000, hookChars: 100, maxHashtags: 3, count: "chars" }, needsMedia: true, blurb: "Shorts and videos; the post becomes the description." },
  { id: "reddit", name: "Reddit", status: "planned", provider: "reddit", env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"], limits: { hardChars: 40000, targetChars: 1500, hookChars: 300, maxHashtags: 0, count: "chars" }, needsMedia: false, blurb: "Text posts to your profile or a community you choose." },
  { id: "google_business", name: "Google Business Profile", status: "planned", provider: "google", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], limits: { hardChars: 1500, targetChars: 750, hookChars: 100, maxHashtags: 0, count: "chars" }, needsMedia: false, blurb: "Updates on your business's Google listing." },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [PlatformId, ...PlatformId[]];

export function spec(id: PlatformId): PlatformSpec {
  const s = PLATFORMS.find((p) => p.id === id);
  if (!s) throw new Error(`Unknown platform ${id}`);
  return s;
}
export const specByProvider = (provider: string) => PLATFORMS.find((p) => p.status === "live" && p.provider === provider);
export const livePlatforms = () => PLATFORMS.filter((p) => p.status === "live");

/** Values that mean "not filled in yet" (deploy templates, CI and Docker build placeholders). */
const PLACEHOLDERS = new Set(["preview", "build", "ci", "test", "changeme", "change-me", "placeholder", "todo", "xxx", "none", "null"]);
const filled = (v: string | undefined) => { const t = (v ?? "").trim(); return t.length >= 8 && !PLACEHOLDERS.has(t.toLowerCase()); };

/** Can people connect this channel on this server? Live, and its app keys set (demo mode stands in). */
export function connectable(id: PlatformId, env: Record<string, string | undefined> = process.env): boolean {
  const s = spec(id);
  if (s.status !== "live") return false;
  if (isDemo()) return true;
  if (id === "linkedin") return linkedinConfigured(env);
  return s.env.every((k) => filled(env[k]));
}

// X weighs characters: code points in these ranges count 1, everything else (CJK, most emoji) 2, and
// every link counts 23 whatever its length. From X's twitter-text configuration (v3).
const LIGHT: [number, number][] = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const URL = /https?:\/\/[^\s]+/g;

export function xLength(text: string): number {
  let n = 0;
  const withoutUrls = text.normalize("NFC").replace(URL, () => { n += 23; return ""; });
  for (const ch of withoutUrls) {
    const c = ch.codePointAt(0)!;
    n += LIGHT.some(([a, b]) => c >= a && c <= b) ? 1 : 2;
  }
  return n;
}

/** A post's length as its platform counts it. */
export const lengthOn = (s: Pick<PlatformSpec, "limits">, text: string) => (s.limits.count === "x" ? xLength(text) : text.length);
