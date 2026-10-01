// What rated examples teach: the rated-up analyses' techniques to reuse, the rated-down ones' patterns
// to avoid, as a short block for the drafting brief. Pure, so it is tested without a database.
import { EXAMPLES } from "./catalog";
import type { AnalysisT } from "./example-analysis";

export type Rating = "up" | "down";
export type Guidance = { liked: string[]; avoid: string[]; up: number; down: number };

/** Turn rated analyses into what to copy and what to avoid. Pure, so it is tested directly. */
export function guidanceFrom(rows: { rating: Rating | null; analysis: AnalysisT | null }[], max: number = EXAMPLES.guidanceMax): Guidance {
  // First wording wins; the same lesson from two examples appears once.
  const uniq = (xs: string[]) => { const seen = new Set<string>(); return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())); };
  const up = rows.filter((r) => r.rating === "up" && r.analysis).slice(0, max);
  const down = rows.filter((r) => r.rating === "down" && r.analysis).slice(0, max);
  return {
    up: up.length, down: down.length,
    liked: uniq(up.flatMap((r) => [r.analysis!.transferable, ...r.analysis!.strengths.slice(0, 2), ...(r.analysis!.visual && r.analysis!.visual.motion !== "static" ? [`Visual: ${r.analysis!.visual.kind}, ${r.analysis!.visual.motion}`] : [])])).slice(0, max * 2),
    avoid: uniq(down.flatMap((r) => [...r.analysis!.weaknesses.slice(0, 2), ...(r.analysis!.cta.engagementBait ? ["Closing on an engagement-bait trade (comment or DM a keyword)"] : []), r.analysis!.transferable])).slice(0, max * 2),
  };
}

/** The block a drafting brief carries, or null when nothing is rated yet. */
export function guidanceText(g: Guidance): string | null {
  if (!g.liked.length && !g.avoid.length) return null;
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  return [
    g.liked.length ? `Techniques from posts this person rated good (use the technique, never the topic or the words):\n${list(g.liked)}` : "",
    g.avoid.length ? `Patterns from posts this person rated bad (avoid):\n${list(g.avoid)}` : "",
  ].filter(Boolean).join("\n\n");
}
