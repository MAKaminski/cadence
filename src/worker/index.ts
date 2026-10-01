// The worker: drafts after check-ins, publishes at the scheduled time, sends reminders, reads imports.
//   pnpm worker          run forever (the "worker" service in deploy/compose.yml)
//   pnpm worker --once   drain what's due, then exit (tests, demo recording)
import { claim, finish, recoverLost, touch, type Job } from "@/lib/jobs";
import { draftFromCheckin, CapReached } from "@/lib/drafting";
import { captureMetrics, publishDraft } from "@/lib/publishing";
import { remindCheckin, remindExpiry, sweep } from "@/lib/reminders";
import { runAnalysis } from "@/services/examples";
import { runImport } from "@/services/history";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
const once = process.argv.includes("--once");

async function run(job: Job): Promise<string | void> {
  switch (job.kind) {
    case "draft": return draftFromCheckin(job.userId, job.refId!);
    case "publish": return publishDraft(job.userId, job.refId!);
    case "remind_checkin": return remindCheckin(job.userId);
    case "remind_expiry": return remindExpiry(job.userId, job.refId!);
    case "metrics": return captureMetrics(job.userId, job.refId!);
    case "analyze_example": return runAnalysis(job.userId, job.refId!);
    case "import_history": return runImport(job.userId, job.refId!, () => touch(job.id));
  }
}

export async function drain(): Promise<number> {
  let n = 0;
  for (let job = await claim(); job; job = await claim()) {
    n++;
    try {
      const note = await run(job);
      await finish(job);
      console.log(`[worker] ${job.kind} ${job.id} done${note ? `: ${note}` : ""}`);
    } catch (e) {
      // A spent allowance isn't worth retrying this month.
      if (e instanceof CapReached) job.attempts = 99;
      await finish(job, e);
      console.error(`[worker] ${job.kind} ${job.id} failed: ${(e as Error).message}`);
    }
  }
  return n;
}

async function main() {
  await recoverLost();
  await sweep();
  if (once) { await drain(); process.exit(0); }
  let lastSweep = Date.now();
  console.log(`[worker] polling every ${POLL_MS}ms`);
  for (;;) {
    await drain().catch((e) => console.error("[worker] drain error", e));
    if (Date.now() - lastSweep > 3_600_000) {
      lastSweep = Date.now();
      await Promise.all([recoverLost(), sweep()]).catch((e) => console.error("[worker] sweep error", e));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (process.argv[1]?.includes("worker")) void main();
