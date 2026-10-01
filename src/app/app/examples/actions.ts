"use server";
// Thin wrappers over src/services/examples.ts. Uploads go through ./upload/route.ts instead.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSubscriber } from "@/lib/session";
import { flagOn } from "@/lib/flags";
import * as svc from "@/services/examples";

type Result = { ok: true } | { ok: false; error: string };
const Id = z.string().uuid();
const Rating = z.enum(["up", "down"]).nullable();

async function run(fn: (userId: string) => Promise<unknown>): Promise<Result> {
  const user = await requireSubscriber();
  if (!(await flagOn("examples", user))) return { ok: false, error: "Examples isn't on for your account yet." };
  try { await fn(user.id); revalidatePath("/app/examples"); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
}

export async function addUrl(url: string, note: string, rating: "up" | "down" | null): Promise<Result> {
  const u = z.string().trim().min(1, "Paste a link.").max(2000, "That link is too long.").safeParse(url);
  const r = Rating.safeParse(rating);
  if (!u.success) return { ok: false, error: u.error.issues[0].message };
  return run((id) => svc.addUrl(id, u.data, { note, rating: r.success ? r.data : null }));
}
export async function rate(id: string, rating: "up" | "down" | null): Promise<Result> {
  if (!Id.safeParse(id).success || !Rating.safeParse(rating).success) return { ok: false, error: "Not saved." };
  return run((u) => svc.rate(u, id, rating));
}
export async function setNote(id: string, note: string): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Not saved." };
  return run((u) => svc.setNote(u, id, note));
}
export async function remove(id: string): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Not deleted." };
  return run((u) => svc.remove(u, id));
}
export async function reanalyze(id: string): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Not queued." };
  return run((u) => svc.reanalyze(u, id));
}
