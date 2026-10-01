// `pnpm signin:check`: which sign-in settings this server has, and what to fix, without printing any value.
// On the server: docker compose -f deploy/compose.yml --env-file deploy/.env run --rm web pnpm signin:check
// Exits 1 when nobody could sign in (or sign-in would break), so it can gate a deploy.
import { setupChecks } from "../src/lib/setup-check";

const checks = setupChecks(process.env);
const width = Math.max(...checks.map((c) => c.keys.length));
for (const c of checks) {
  const mark = c.ok ? "ok   " : c.level === "error" ? "ERROR" : "warn ";
  console.log(`${mark}  ${c.keys.padEnd(width)}  ${c.note}`);
}
process.exit(checks.some((c) => !c.ok && c.level === "error") ? 1 : 0);
