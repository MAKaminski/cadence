"use server";
// Thin wrappers: every rule lives in src/services, shared with the API and MCP server.
import { revalidatePath } from "next/cache";
import { requireSubscriber } from "@/lib/session";
import * as svc from "@/services/drafts";
import { recordMetrics } from "@/services/publications";
import type { ManualKey } from "@/lib/metric-input";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<unknown>, message?: (r: unknown) => string | undefined): Promise<Result> {
  const user = await requireSubscriber();
  try {
    const r = await fn(user.id);
    revalidatePath("/app"); revalidatePath("/app/published"); revalidatePath("/app/results");
    return { ok: true, message: message?.(r) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function saveCheckin(input: { body: string }) { return run((u) => svc.saveCheckin(u, input.body)); }
export async function approveDraft(id: string) { return run((u) => svc.approveDraft(u, id), (r) => (r as svc.DraftOut).scheduledFor ?? undefined); }
export async function editDraft(id: string, body: string) { return run((u) => svc.editDraft(u, id, body)); }
export async function skipDraft(id: string) { return run((u) => svc.skipDraft(u, id)); }
export async function postNow(id: string) { return run((u) => svc.postNow(u, id)); }
export async function setAutoPublish(on: boolean) {
  const r = await run((u) => svc.setAutoPublish(u, on));
  revalidatePath("/app/settings");
  return r;
}
export async function saveNumbers(publicationId: string, numbers: Partial<Record<ManualKey, string>>) {
  return run((u) => recordMetrics(u, publicationId, numbers), () => "Numbers saved.");
}
