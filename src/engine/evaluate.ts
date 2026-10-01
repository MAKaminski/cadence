import { LIMITS } from "@/lib/catalog";
import { spec, type PlatformSpec } from "@/platforms/registry";
import { formatFor } from "./format";
import { qualityChecks } from "./gate";
import { unsupportedClaims } from "./facts";
import { closestRecent, noGoHits } from "./suppress";
import type { Check } from "./types";

export type Context = { facts: string[]; notes: string[]; topics: string[]; noGo: string[]; recent: string[] };
export type Evaluation = { text: string; checks: Check[]; fixes: string[]; verdict: "ok" | "rewrite" | "held"; score: number };

/** Run every check on one candidate, in the order shown to the user. */
export function evaluate(raw: string, ctx: Context, s: Pick<PlatformSpec, "name" | "limits"> = spec("linkedin")): Evaluation {
  const { text, fixes } = formatFor(raw, s);
  const label = `${s.name} formatting`;
  const checks: Check[] = [
    fixes.length ? { id: "format", label, outcome: "fixed", detail: fixes.join("; ") } : { id: "format", label, outcome: "pass" },
    ...qualityChecks(text, s),
  ];

  const claims = unsupportedClaims(text, [...ctx.facts, ...ctx.notes, ...ctx.topics]);
  checks.push(claims.length
    ? { id: "facts", label: "Fact check", outcome: "held", detail: `Not in your facts or notes: ${claims.join(", ")}` }
    : { id: "facts", label: "Fact check", outcome: "pass", detail: "Every number, name and credential comes from you" });

  const hits = noGoHits(text, ctx.noGo);
  checks.push(hits.length
    ? { id: "no_go", label: "Never-write-about list", outcome: "held", detail: `Mentions: ${hits.join(", ")}` }
    : { id: "no_go", label: "Never-write-about list", outcome: "pass" });

  const near = closestRecent(text, ctx.recent);
  checks.push(near.score >= LIMITS.repeatSimilarity
    ? { id: "repeat", label: "Repeat check", outcome: "held", detail: `${Math.round(near.score * 100)}% similar to a recent post` }
    : { id: "repeat", label: "Repeat check", outcome: "pass", detail: ctx.recent.length ? `Closest recent post is ${Math.round(near.score * 100)}% similar` : "No earlier posts yet" });

  const verdict = checks.some((c) => c.outcome === "held") ? "held" : checks.some((c) => c.outcome === "rewrite") ? "rewrite" : "ok";
  const score = checks.filter((c) => c.outcome === "pass" || c.outcome === "fixed").length;
  return { text, checks, fixes, verdict, score };
}

/** Best candidate: fewest problems first, then closest to the target length. */
export function pickBest(evals: Evaluation[]): Evaluation {
  const rank = { ok: 0, rewrite: 1, held: 2 } as const;
  return [...evals].sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.score - a.score
    || Math.abs(a.text.length - LIMITS.targetChars * 0.7) - Math.abs(b.text.length - LIMITS.targetChars * 0.7))[0];
}
