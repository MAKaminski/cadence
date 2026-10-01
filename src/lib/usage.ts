// Usage measurement: one row per thing a person does with a feature. The usage page aggregates them.
import { asUser } from "@/db";
import { usageEvents } from "@/db/schema";

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
export type UsageInput = { feature: string; action: string; bytes?: number | null; costUsd?: number | null; meta?: Record<string, unknown> };

const row = (userId: string, e: UsageInput) => ({
  userId, feature: e.feature, action: e.action, bytes: e.bytes ?? null,
  costUsd: e.costUsd == null ? null : e.costUsd.toFixed(6), meta: e.meta ?? {},
});

/** Record inside an existing transaction (so the event and the change commit together). */
export async function trackTx(tx: Tx, userId: string, e: UsageInput) {
  await tx.insert(usageEvents).values(row(userId, e));
}

/** Record on its own. Never throws: measuring must not break the thing being measured. */
export async function track(userId: string, e: UsageInput) {
  try { await asUser(userId, (tx) => tx.insert(usageEvents).values(row(userId, e))); }
  catch (err) { console.error("[usage]", err); }
}
