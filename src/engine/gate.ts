import { BANNED_PHRASES } from "@/lib/catalog";
import { lengthOn, spec, type PlatformSpec } from "@/platforms/registry";
import type { Check } from "./types";

/** Style checks, against the channel's own limits. A miss asks for one rewrite; the hard limit can
 *  never be published. */
export function qualityChecks(text: string, s: Pick<PlatformSpec, "name" | "limits"> = spec("linkedin")): Check[] {
  const L = s.limits, len = lengthOn(s, text);
  const hook = text.split("\n").find((l) => l.trim()) ?? "";
  const lower = text.toLowerCase();
  const phrases = BANNED_PHRASES.filter((p) => lower.includes(p));
  return [
    hook.length <= L.hookChars
      ? { id: "hook", label: "Opening line", outcome: "pass", detail: `${hook.length} of ${L.hookChars} characters` }
      : { id: "hook", label: "Opening line", outcome: "rewrite", detail: `${hook.length} characters; the first ${L.hookChars} are all most readers see` },
    phrases.length === 0
      ? { id: "phrases", label: "Stock phrases", outcome: "pass" }
      : { id: "phrases", label: "Stock phrases", outcome: "rewrite", detail: `Found: ${phrases.map((p) => `"${p}"`).join(", ")}` },
    len <= L.targetChars
      ? { id: "length", label: "Length", outcome: "pass", detail: `${len} of ${L.targetChars} characters` }
      : { id: "length", label: "Length", outcome: "rewrite", detail: `${len} characters; aiming for ${L.targetChars} or fewer` },
    len <= L.hardChars
      ? { id: "hard_length", label: `${s.name} limit`, outcome: "pass" }
      : { id: "hard_length", label: `${s.name} limit`, outcome: "held", detail: `${len} characters; ${s.name} allows ${L.hardChars}` },
  ];
}
