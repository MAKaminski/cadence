// cadence: a small command-line client for the Cadence API. Types come from docs/openapi.json via
// openapi-typescript, so the CLI can't drift from the API.
import { Command } from "commander";
import createClient from "openapi-fetch";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import type { paths } from "./api";

const DIR = path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "cadence");
const FILE = path.join(DIR, "credentials");
type Creds = { host: string; key: string };

function loadCreds(): Creds {
  const fromEnv = process.env.CADENCE_API_KEY;
  if (fromEnv) return { key: fromEnv, host: process.env.CADENCE_HOST ?? "http://localhost:3000" };
  if (!existsSync(FILE)) fail("Not logged in. Run `cadence login --host https://your-cadence-host`, or set CADENCE_API_KEY.");
  return JSON.parse(readFileSync(FILE, "utf8")) as Creds;
}

function fail(msg: string): never { console.error(`cadence: ${msg}`); process.exit(1); }

function client(c = loadCreds()) {
  return createClient<paths>({ baseUrl: c.host.replace(/\/$/, ""), headers: { authorization: `Bearer ${c.key}` } });
}

/** Unwrap an openapi-fetch result: print the problem detail and exit on errors. */
function ok<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.error || !r.data) {
    const p = r.error as { title?: string; detail?: string } | undefined;
    const retry = r.response.headers.get("retry-after");
    fail(`${r.response.status} ${p?.title ?? "error"}: ${p?.detail ?? "no detail"}${retry ? ` (retry in ${retry}s)` : ""}`);
  }
  return r.data;
}

async function stdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "not scheduled");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const program = new Command().name("cadence").description("Cadence from your terminal: check in, review drafts, see results.").version("0.4.0");

program.command("login")
  .description("Save your API key (from Settings → API keys) for this machine")
  .requiredOption("--host <url>", "your Cadence server, e.g. https://cadence.example.com")
  .option("--key <key>", "API key (otherwise you'll be asked)")
  .action(async (o: { host: string; key?: string }) => {
    let key = o.key;
    if (!key) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      key = (await rl.question("API key: ")).trim();
      rl.close();
    }
    const me = ok(await client({ host: o.host, key }).GET("/api/v1/me"));
    mkdirSync(DIR, { recursive: true, mode: 0o700 });
    writeFileSync(FILE, JSON.stringify({ host: o.host, key }), { mode: 0o600 });
    chmodSync(FILE, 0o600);
    console.log(`Logged in as ${me.name} (scopes: ${me.scopes.join(", ")}). Key saved to ${FILE} (readable only by you).`);
  });

program.command("logout").description("Forget the saved key").action(() => { rmSync(FILE, { force: true }); console.log("Logged out."); });

program.command("status").description("Plan, model use and this week's posts").action(async () => {
  const c = client();
  const me = ok(await c.GET("/api/v1/me"));
  const [week] = ok(await c.GET("/api/v1/stats/outreach", { params: { query: { weeks: 1 } } }));
  console.log(`${me.name} · ${me.subscription?.status ?? "no plan"} · LinkedIn ${me.linkedin?.status ?? "not connected"}`);
  console.log(`This week: ${week.posts} of ${week.target} posts · model use $${me.modelUseThisMonthUsd.toFixed(2)} of $${me.modelAllowanceUsd}`);
});

program.command("checkin [text...]").description("Save this week's notes (or pipe them in); drafting starts right away").action(async (words: string[]) => {
  const body = (words.join(" ") || (await stdin())).trim();
  if (!body) fail("Give me some notes: cadence checkin \"what happened this week\"  or  cat notes.md | cadence checkin");
  ok(await client().POST("/api/v1/checkins", { body: { body } }));
  console.log("Saved. Drafts will be ready in a minute: cadence drafts");
});

program.command("drafts").description("List drafts waiting for you")
  .option("-s, --status <list>", "comma-separated statuses", "draft,held,scheduled")
  .action(async (o: { status: string }) => {
    const r = ok(await client().GET("/api/v1/drafts", { params: { query: { status: o.status, limit: 50 } } }));
    if (r.drafting) console.log("(still writing drafts from your latest check-in…)");
    if (!r.drafts.length) return console.log("No drafts.");
    for (const d of r.drafts) {
      console.log(`\n${d.id}  [${d.status}]  ${d.why.angle}  ${d.status === "scheduled" ? `→ ${when(d.scheduledFor)}` : ""}`);
      console.log(`  ${d.body.split("\n")[0].slice(0, 110)}`);
    }
  });

program.command("show <id>").description("A draft in full").action(async (id: string) => {
  const d = ok(await client().GET("/api/v1/drafts/{id}", { params: { path: { id } } }));
  console.log(`[${d.status}] ${d.why.angle} · v${d.version} · ${when(d.scheduledFor)}\n\n${d.body}`);
});

program.command("why <id>").description("Why a draft reads the way it does: every check and what changed").action(async (id: string) => {
  const d = ok(await client().GET("/api/v1/drafts/{id}", { params: { path: { id } } }));
  const mark = { pass: "✓", fixed: "~", rewrite: "↻", held: "!" } as const;
  console.log(`Angle: ${d.why.angle}. ${d.why.why}\n`);
  for (const c of d.why.checks) console.log(`  ${mark[c.outcome]} ${c.label}${c.detail ? ` · ${c.detail}` : ""}`);
  if (d.why.adjustments.length) console.log(`\nChanged:\n${d.why.adjustments.map((a) => `  - ${a}`).join("\n")}`);
  console.log(`\nPicked from ${d.why.variantsConsidered} variants${d.why.rewritten ? ", rewritten once" : ""} · ${d.why.model} · $${d.why.costUsd.toFixed(4)}`);
});

program.command("edit <id>").description("Replace a draft's text (pipe it in or use --file); it is re-checked and needs approving again")
  .option("-f, --file <path>", "read the new text from a file")
  .action(async (id: string, o: { file?: string }) => {
    const body = (o.file ? readFileSync(o.file, "utf8") : await stdin()).trim();
    if (!body) fail("Pipe the new text in, or pass --file.");
    const d = ok(await client().PATCH("/api/v1/drafts/{id}", { params: { path: { id } }, body: { body } }));
    console.log(`Saved as version ${d.version} [${d.status}]. Held checks: ${d.why.checks.filter((c) => c.outcome === "held").map((c) => c.label).join(", ") || "none"}.`);
  });

program.command("approve <id>").description("Approve a draft; it posts at your next slot (needs a key with the approve scope)")
  .option("-y, --yes", "don't ask for confirmation")
  .action(async (id: string, o: { yes?: boolean }) => {
    const c = client();
    const d = ok(await c.GET("/api/v1/drafts/{id}", { params: { path: { id } } }));
    if (!o.yes) {
      console.log(`\n${d.body}\n`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const a = (await rl.question("Post this, exactly as shown, at your next slot? [y/N] ")).trim().toLowerCase();
      rl.close();
      if (a !== "y" && a !== "yes") return console.log("Not approved.");
    }
    const r = ok(await c.POST("/api/v1/drafts/{id}/approve", { params: { path: { id } } }));
    console.log(`Approved. Posts ${when(r.scheduledFor)}.`);
  });

program.command("skip <id>").description("Skip a draft").action(async (id: string) => {
  ok(await client().POST("/api/v1/drafts/{id}/skip", { params: { path: { id } } }));
  console.log("Skipped.");
});

program.command("stats").description("Outreach per week and impact per post").option("-w, --weeks <n>", "weeks of outreach", "8").action(async (o: { weeks: string }) => {
  const c = client();
  const weeks = ok(await c.GET("/api/v1/stats/outreach", { params: { query: { weeks: Number(o.weeks) } } }));
  console.log("Outreach (posts per week, # = post, · = short of target)");
  for (const w of weeks) console.log(`  ${w.week}  ${"#".repeat(w.posts)}${"·".repeat(Math.max(0, w.target - w.posts))}  ${w.posts}/${w.target}`);
  const imp = ok(await c.GET("/api/v1/stats/impact"));
  if (!imp.posts.length) return console.log("\nImpact: no results yet (waiting for LinkedIn analytics access).");
  const best = imp.posts.reduce((b, p) => (p.rate > b.rate ? p : b));
  const avg = imp.posts.reduce((a, p) => a + p.rate, 0) / imp.posts.length;
  console.log(`\nImpact${imp.posts.some((p) => p.sample) ? " (sample numbers)" : ""}: ${imp.posts.length} posts, average engagement ${pct(avg)}`);
  console.log(`  Best: "${best.excerpt}" · ${pct(best.rate)} · ${best.impressions.toLocaleString()} impressions`);
});

program.parseAsync().catch((e: Error) => fail(e.message));
