// What a page says about itself: title, author, text and its main image or video, from the Open Graph
// and Twitter tags every social site sets for link previews. Pure, so it is tested on fixtures.
import { EXAMPLES } from "./catalog";

export type Preview = { title: string | null; author: string | null; body: string | null; image: string | null; video: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
export const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

function meta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/[:.]/g, "\\$&")}["'][^>]*>`, "i").exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decode(content).trim();
  }
  return null;
}

/** "Jane Doe on LinkedIn: Most teams…" → author "Jane Doe". */
function authorFrom(title: string | null): string | null {
  const m = title?.match(/^(.{2,80}?) on (LinkedIn|X|Twitter|Threads|Instagram)\b/i);
  return m ? m[1].trim() : null;
}

export function parsePreview(html: string, baseUrl: string): Preview {
  const abs = (u: string | null) => { if (!u) return null; try { const x = new URL(u, baseUrl); return /^https?:$/.test(x.protocol) ? x.toString() : null; } catch { return null; } };
  const title = meta(html, "og:title", "twitter:title") ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)![1]).trim() : null);
  const body = meta(html, "og:description", "twitter:description", "description");
  return {
    title,
    author: meta(html, "article:author", "author") ?? authorFrom(title),
    body: body ? body.slice(0, EXAMPLES.bodyChars) : null,
    image: abs(meta(html, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src")),
    video: abs(meta(html, "og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream")),
  };
}

/** What kind of media a content type is, for display and analysis. */
export function mediaKindOf(mime: string): "image" | "gif" | "video" | "pdf" | "other" {
  if (mime === "image/gif") return "gif";
  if (/^image\/(png|jpeg|webp)$/.test(mime)) return "image";
  if (/^video\/(mp4|webm|quicktime)$/.test(mime)) return "video";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

/** Uploads we accept: images (not SVG, which can carry script), GIFs, short videos and PDFs (carousels). */
export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime", "application/pdf"] as const;

/** Sniff the real type from the first bytes, so a renamed file can't pose as an image. */
export function sniff(buf: Buffer): string | null {
  const hex = buf.subarray(0, 12).toString("hex");
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("474946383761") || hex.startsWith("474946383961")) return "image/gif";
  if (hex.startsWith("52494646") && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (hex.startsWith("25504446")) return "application/pdf";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return buf.subarray(8, 12).toString("ascii").startsWith("qt") ? "video/quicktime" : "video/mp4";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  return null;
}
