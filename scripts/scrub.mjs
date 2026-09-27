#!/usr/bin/env node
// Public repo guard: fail if tracked files contain secrets or personal identifiers.
// Tier A (always): pattern-based. Tier B (local only): extra terms from a file OUTSIDE the repo,
// named by CADENCE_PRIVATE_TERMS, so private vocabulary never has to live in this public repo.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const patterns = [
  ["linkedin profile url", /linkedin\.com\/in\/[a-z0-9-]{3,}/i],
  ["linkedin post urn", /urn:li:(activity|share|ugcPost):\d{6,}/],
  ["linkedin member id", /\bACoAA[A-Za-z0-9_-]{10,}/],
  ["stripe live key", /\b(sk|rk|pk)_live_[A-Za-z0-9]{10,}/],
  ["stripe webhook secret", /\bwhsec_[A-Za-z0-9]{20,}/],
  ["anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["generic api key", /\bapikey_[A-Za-z0-9_]{20,}/],
  ["home path", /\/Users\/[a-z][a-z0-9._-]+\//],
  ["email", /\b[A-Za-z0-9._%+-]+@(?!example\.(com|org)\b)[A-Za-z0-9.-]+\.[a-z]{2,}\b/],
];
const extra = process.env.CADENCE_PRIVATE_TERMS && existsSync(process.env.CADENCE_PRIVATE_TERMS)
  ? readFileSync(process.env.CADENCE_PRIVATE_TERMS, "utf8").split("\n").map((t) => t.trim()).filter((t) => t.length >= 4)
  : [];
const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n").filter((f) => f && !/^(pnpm-lock\.yaml|drizzle\/meta\/|public\/)/.test(f) && !f.endsWith(".svg"));
let bad = 0;
for (const f of files) {
  if (!existsSync(f) || !statSync(f).isFile()) continue;
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const [name, rx] of patterns) if (rx.test(line)) { console.log(`SCRUB ${f}:${i + 1} ${name}`); bad++; }
    for (const t of extra) if (line.toLowerCase().includes(t.toLowerCase())) { console.log(`SCRUB ${f}:${i + 1} private term`); bad++; }
  });
}
console.log(bad ? `scrub: ${bad} finding(s)` : `scrub: clean (${files.length} files${extra.length ? `, ${extra.length} private terms` : ""})`);
process.exit(bad ? 1 : 0);
