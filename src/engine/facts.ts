// Deterministic claim check. Anything that looks like a specific claim (a number, a named
// organisation, a credential) must appear in what the user gave us: their facts list or this week's
// notes. It is deliberately strict — a false alarm costs the user one look; a false claim costs trust.

const COMMON = new Set(("I A An The This That These Those It Its We Our You Your My Me He She They Their " +
  "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August " +
  "September October November December LinkedIn Here What When Why How If And But So Or Not No Yes Most Every " +
  "One Two Three Four Five Six Seven Eight Nine Ten First Last Next Today Tomorrow Yesterday Week Month Year " +
  "AI OK CEO CFO CTO COO VP PS FAQ US USA UK EU").split(" ").map((w) => w.toLowerCase()));

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
const digits = (s: string) => s.replace(/[,$€£%]/g, "").replace(/\.0+$/, "");

export function extractClaims(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[$€£]?\d[\d,]*(?:\.\d+)?\s?(?:%|[kKmMbB]\b|x\b)?/g)) {
    const n = m[0].trim();
    if (/^\d$/.test(digits(n))) continue; // single digits ("3 things") are phrasing, not claims
    out.add(n);
  }
  // Credentials and acronyms: CFA, CPA, SOC2 …
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) if (!COMMON.has(m[0].toLowerCase())) out.add(m[0]);
  // Capitalised names not at the start of a sentence or line.
  for (const m of text.matchAll(/(?<![.!?:\n•]\s*)(?<=\S\s+)([A-Z][a-z][\w&'-]*(?:\s+(?:of|&|and|for)?\s*[A-Z][\w&'-]+)*)/g)) {
    const words = m[1].split(/\s+/).filter((w) => !COMMON.has(w.toLowerCase()));
    if (words.length) out.add(m[1]);
  }
  return [...out];
}

/** Claims in `text` that appear nowhere in `sources` (facts + notes + topics). */
export function unsupportedClaims(text: string, sources: string[]): string[] {
  const corpus = norm(sources.join("\n"));
  const corpusNums = new Set((corpus.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(digits));
  return extractClaims(text).filter((c) => {
    if (/\d/.test(c)) return !(c.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).every((n) => corpusNums.has(digits(n)));
    return !corpus.includes(norm(c));
  });
}
