import { spec, type PlatformSpec } from "@/platforms/registry";

/** LinkedIn, X and the rest show markdown as raw symbols, so drafts are turned into plain text that
 *  renders well. Returns the text and a plain-English list of what changed ("Why this draft"). */
export function formatForLinkedIn(input: string): { text: string; fixes: string[] } {
  return formatFor(input, spec("linkedin"));
}

export function formatFor(input: string, s: Pick<PlatformSpec, "name" | "limits">): { text: string; fixes: string[] } {
  const max = s.limits.maxHashtags;
  const fixes: string[] = [];
  let t = input.replace(/\r\n?/g, "\n");
  const before = t;

  t = t
    .replace(/^#{1,6}\s+/gm, "")                              // headings
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2")              // bold
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2") // italic
    .replace(/`([^`\n]+)`/g, "$1")                            // inline code
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 $2") // links: keep the URL, the platform links it
    .replace(/^\s*[-*+]\s+/gm, "• ");                         // list markers
  if (t !== before) fixes.push(`Removed markdown ${s.name} would show as raw symbols`);

  const tidy = t.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (tidy !== t.trim()) fixes.push("Tidied line breaks");
  t = tidy;

  const tags = t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > max) {
    let seen = 0;
    t = t.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m) => (++seen <= max ? m : "")).replace(/[ \t]+$/gm, "").trim();
    fixes.push(`Cut hashtags from ${tags.length} to ${max}`);
  }
  return { text: t, fixes };
}

// LinkedIn's Posts API reads `commentary` as "little text format", where these characters are markup.
// Unescaped, a post can be cut off at the first bracket or rejected outright.
const RESERVED = /[\\()[\]{}<>@|~_*]/g;

/** Escape text for the `commentary` field. Applied only at publish time; users always see plain text. */
export function escapeCommentary(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`);
}
