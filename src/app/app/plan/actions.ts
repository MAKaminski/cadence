"use server";
// Thin wrappers over src/services/plan.ts, where every rule lives.
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireSubscriber } from "@/lib/session";
import * as svc from "@/services/plan";
import type { EngagePlan, PostingPlan } from "@/engine/plan";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: (userId: string) => Promise<T>, dry = false): Promise<Result<T>> {
  const user = await requireSubscriber();
  try {
    const data = await fn(user.id);
    if (!dry) { revalidatePath("/app/plan"); revalidatePath("/app"); }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function setPosting(input: z.infer<typeof svc.postingInput>): Promise<Result<PostingPlan>> {
  const p = svc.postingInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the number." };
  return run((u) => svc.setPosting(u, p.data), p.data.dryRun);
}
export async function setEngage(input: z.infer<typeof svc.engageInput>): Promise<Result<EngagePlan>> {
  const p = svc.engageInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the number." };
  return run((u) => svc.setEngage(u, p.data), p.data.dryRun);
}
export async function updateSchedule(key: string, patch: z.infer<typeof svc.schedulePatch>) {
  const p = svc.schedulePatch.safeParse(patch);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? "Check the values." };
  return run((u) => svc.updateSchedule(u, key, p.data));
}
export async function setPaused(paused: boolean, reason?: string) {
  return run((u) => (paused ? svc.setHold(u, "all", reason) : svc.clearHold(u, "all")));
}
