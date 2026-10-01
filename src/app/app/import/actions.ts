"use server";
// Thin wrappers over src/services/history.ts. The upload itself goes through ./uploads (route handlers).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSubscriber } from "@/lib/session";
import * as svc from "@/services/history";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const Id = z.string().uuid();

async function run(fn: (userId: string) => Promise<string | void>): Promise<Result> {
  const user = await requireSubscriber();
  try {
    const message = await fn(user.id);
    for (const p of ["/app/import", "/onboarding/import", "/onboarding"]) revalidatePath(p);
    return { ok: true, message: message ?? undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
}

export async function decide(id: string, choice: "accept" | "dismiss"): Promise<Result> {
  if (!Id.safeParse(id).success || !["accept", "dismiss"].includes(choice)) return { ok: false, error: "Not saved." };
  return run((u) => svc.decide(u, id, choice));
}
export async function draftIdea(id: string): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Not queued." };
  const r = await run(async (u) => { await svc.draftIdea(u, id); return "Drafting from it now. Your drafts appear on This week."; });
  revalidatePath("/app");
  return r;
}
export async function deleteImported(): Promise<Result> {
  return run(async (u) => { const n = await svc.deleteAll(u); return n ? "Imported data deleted." : "There was nothing to delete."; });
}
