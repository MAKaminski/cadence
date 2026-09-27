import { BANNED_PHRASES, LIMITS } from "@/lib/catalog";
import type { Check } from "./types";

/** Style checks. A miss asks for one rewrite; the hard limit can never be published. */
export function qualityChecks(text: string): Check[] {
  const hook = text.split("\n").find((l) => l.trim()) ?? "";
  const lower = text.toLowerCase();
  const phrases = BANNED_PHRASES.filter((p) => lower.includes(p));
  return [
    hook.length <= LIMITS.hookChars
      ? { id: "hook", label: "Opening line", outcome: "pass", detail: `${hook.length} of ${LIMITS.hookChars} characters` }
      : { id: "hook", label: "Opening line", outcome: "rewrite", detail: `${hook.length} characters; the first ${LIMITS.hookChars} are all most readers see` },
    phrases.length === 0
      ? { id: "phrases", label: "Stock phrases", outcome: "pass" }
      : { id: "phrases", label: "Stock phrases", outcome: "rewrite", detail: `Found: ${phrases.map((p) => `"${p}"`).join(", ")}` },
    text.length <= LIMITS.targetChars
      ? { id: "length", label: "Length", outcome: "pass", detail: `${text.length} of ${LIMITS.targetChars} characters` }
      : { id: "length", label: "Length", outcome: "rewrite", detail: `${text.length} characters; aiming for ${LIMITS.targetChars} or fewer` },
    text.length <= LIMITS.hardChars
      ? { id: "hard_length", label: "LinkedIn limit", outcome: "pass" }
      : { id: "hard_length", label: "LinkedIn limit", outcome: "held", detail: `${text.length} characters; LinkedIn allows ${LIMITS.hardChars}` },
  ];
}
