// A small Postgres job queue. Claiming uses FOR UPDATE SKIP LOCKED, so any number of workers can
// run without two of them taking the same job.
import { sql } from "drizzle-orm";
import { asWorker } from "@/db";
import { jobs } from "@/db/schema";

type Kind = (typeof jobs.$inferInsert)["kind"];
type Tx = Parameters<Parameters<typeof asWorker>[0]>[0];
export type Job = typeof jobs.$inferSelect;

/** Leave a job for the worker. Pass the caller's transaction so the job commits with the change. */
export function enqueue(tx: Tx, userId: string, kind: Kind, refId: string | null, runAt = new Date()) {
  return tx.insert(jobs).values({ userId, kind, refId, runAt }).onConflictDoNothing();
}

/** Minutes a claimed job may run before it is presumed lost with its worker. */
export const LEASE_MINUTES = 10;
/** Publishing is never repeated automatically; everything else gets three tries. */
export const maxAttempts = (kind: string) => (kind === "publish" ? 1 : 3);

export async function claim(): Promise<Job | null> {
  return asWorker(async (tx) => {
    const rows = await tx.execute(sql`
      update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
      where id = (select id from jobs where status = 'queued' and run_at <= now()
                  order by run_at for update skip locked limit 1)
      returning id`);
    const id = (rows as unknown as { id: string }[])[0]?.id;
    if (!id) return null;
    const [job] = await tx.select().from(jobs).where(sql`${jobs.id} = ${id}`);
    return job;
  });
}

export async function finish(job: Job, error?: unknown) {
  await asWorker(async (tx) => {
    if (!error) {
      await tx.update(jobs).set({ status: "done", lockedAt: null, lastError: null }).where(sql`${jobs.id} = ${job.id}`);
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    const retry = job.attempts < maxAttempts(job.kind);
    await tx.update(jobs).set({
      status: retry ? "queued" : "failed",
      lockedAt: null,
      lastError: msg.slice(0, 1000),
      runAt: retry ? new Date(Date.now() + 2 ** job.attempts * 60_000) : job.runAt,
    }).where(sql`${jobs.id} = ${job.id}`);
  });
}

/** Put lost jobs back. A lost publish job is never retried: its post may already be live. */
export async function recoverLost() {
  await asWorker(async (tx) => {
    await tx.execute(sql`update jobs set status = 'failed', locked_at = null,
      last_error = 'The worker stopped during publishing; marked for review, not retried.'
      where status = 'running' and kind = 'publish' and locked_at < now() - make_interval(mins => ${LEASE_MINUTES})`);
    await tx.execute(sql`update jobs set status = 'queued', locked_at = null
      where status = 'running' and kind <> 'publish' and locked_at < now() - make_interval(mins => ${LEASE_MINUTES})`);
    await tx.execute(sql`update publications set status = 'needs_review'
      where status = 'publishing' and created_at < now() - interval '5 minutes'`);
  });
}

/** A long job (an import) renews its lease so it isn't presumed lost while it is still working. */
export async function touch(jobId: string) {
  await asWorker((tx) => tx.update(jobs).set({ lockedAt: new Date() }).where(sql`${jobs.id} = ${jobId} and ${jobs.status} = 'running'`));
}
