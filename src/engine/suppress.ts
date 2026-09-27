import { LIMITS } from "@/lib/catalog";

const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

function trigrams(s: string): Set<string> {
  const t = ` ${clean(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Jaccard similarity of character trigrams: 1 = identical, 0 = nothing shared. */
export function similarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

export function closestRecent(text: string, recent: string[]): { score: number; index: number } {
  let best = { score: 0, index: -1 };
  recent.slice(0, LIMITS.repeatLookback).forEach((r, index) => {
    const score = similarity(text, r);
    if (score > best.score) best = { score, index };
  });
  return best;
}

/** Never-write-about entries found in the text (whole words, any case). */
export function noGoHits(text: string, noGo: string[]): string[] {
  const t = ` ${clean(text)} `;
  return noGo.filter((n) => clean(n) && t.includes(` ${clean(n)} `));
}
