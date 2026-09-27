// `pnpm demo`: the whole product on your machine with no keys. Migrates the local database, then runs
// the web app and the worker in demo mode. Needs Postgres (see README) at DATABASE_URL or the default.
import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const vars = {
  ...process.env,
  CADENCE_DEMO: "1",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:dev@localhost:55432/cadence",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
  WORKER_POLL_MS: process.env.WORKER_POLL_MS ?? "1500",
};
execSync("pnpm db:migrate", { stdio: "inherit", env: vars });
const web = process.argv.includes("--prod") ? ["next", "start", "-p", "3000"] : ["next", "dev", "-p", "3000"];
const procs = [
  spawn("pnpm", ["exec", ...web], { stdio: "inherit", env: vars }),
  spawn("pnpm", ["exec", "tsx", "src/worker/index.ts"], { stdio: "inherit", env: vars }),
];
console.log("\n  Cadence demo: http://localhost:3000  (Ctrl+C to stop)\n");
const stop = () => { for (const p of procs) p.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => { if (code) { console.error(`demo: a process exited with ${code}`); stop(); } });
