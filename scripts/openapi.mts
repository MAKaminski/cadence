// Writes docs/openapi.json from the API's route definitions. `--check` fails if it is out of date, so
// the published spec (and the CLI types generated from it) always match the code.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

Object.assign(process.env, { CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", DATABASE_URL: process.env.DATABASE_URL ?? "postgres://unused@localhost/unused" });
const { api } = await import("../src/api/app");
const doc = await (await api.request("https://api.cadence.example/api/v1/openapi.json")).json();
doc.servers = [{ url: "https://YOUR-CADENCE-HOST", description: "Your Cadence server" }];
const out = JSON.stringify(doc, null, 2) + "\n";
const path = "docs/openapi.json";
if (process.argv.includes("--check")) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== out) { console.error("docs/openapi.json is stale. Run `pnpm openapi`."); process.exit(1); }
  console.log("docs/openapi.json is current.");
} else { writeFileSync(path, out); console.log(`Wrote ${path} (${Object.keys(doc.paths).length} paths).`); }
process.exit(0);
