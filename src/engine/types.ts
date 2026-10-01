/** One check's result, as shown in "Why this draft". */
export type Check = {
  id: "format" | "hook" | "phrases" | "length" | "hard_length" | "facts" | "no_go" | "repeat";
  label: string;
  outcome: "pass" | "fixed" | "rewrite" | "held";
  detail?: string;
};

/** What drafts.gate holds. */
export type GateRecord = {
  angle: string;
  why: string;
  checks: Check[];
  adjustments: string[];
  verdict: "ok" | "held";
  rewritten: boolean;
  model: string;
  costUsd: number;
  variantsConsidered: number;
  /** Rated examples that steered the draft (Examples page), when the feature is on and any are rated. */
  examples?: { up: number; down: number };
  /** For a channel version (X…): the LinkedIn draft it was written from. */
  adaptedFrom?: string;
};
