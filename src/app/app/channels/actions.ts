"use server";
// Thin wrappers over src/services/channels.ts. Connecting itself happens in the browser (linkSocial).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSubscriber } from "@/lib/session";
import { requireDemo } from "@/lib/mode";
import { PLATFORM_IDS } from "@/platforms/registry";
import * as svc from "@/services/channels";

type Result = { ok: true } | { ok: false; error: string };
const Id = z.enum(PLATFORM_IDS);

async function run(id: unknown, fn: (userId: string, id: z.infer<typeof Id>) => Promise<unknown>): Promise<Result> {
  const p = Id.safeParse(id);
  if (!p.success) return { ok: false, error: "Unknown channel." };
  const user = await requireSubscriber();
  try { await fn(user.id, p.data); revalidatePath("/app/channels"); revalidatePath("/app"); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
}

export async function setDrafting(id: string, on: boolean) { return run(id, (u, c) => svc.setDrafting(u, c, on)); }
export async function disconnect(id: string) { return run(id, svc.disconnect); }
export async function connectDemo(id: string) { requireDemo(); return run(id, svc.connectDemo); }
