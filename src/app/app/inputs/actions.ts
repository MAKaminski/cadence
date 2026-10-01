"use server";
// Thin wrappers for the setup fields edited one at a time. The rules are the API's (`profilePatch`,
// `setVoiceSamples` in src/services/profile.ts). Plan, channels, check-ins and automatic posting are
// edited here through their own pages' actions, so each input keeps one set of rules.
import { revalidatePath } from "next/cache";
import { requireSubscriber } from "@/lib/session";
import { lines, patchProfile, profilePatch, setVoiceSamples } from "@/services/profile";

type Result = { ok: true } | { ok: false; error: string };
export type SetupField = "role" | "audience" | "goals" | "facts" | "topics" | "noGo" | "model";
const LISTS = new Set<SetupField>(["facts", "topics", "noGo"]);

async function run(fn: (userId: string) => Promise<unknown>): Promise<Result> {
  const user = await requireSubscriber();
  try { await fn(user.id); revalidatePath("/app/inputs"); revalidatePath("/app/settings"); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
}

/** One setup field. Lists come in as text, one item per line (topics and no-go also split on commas, as in setup). */
export async function saveSetupField(field: SetupField, value: string): Promise<Result> {
  const v = LISTS.has(field) ? lines(field === "facts" ? value : value.replace(/,/g, "\n")) : value;
  const p = profilePatch.safeParse({ [field]: v });
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, error: i?.code === "too_small" && LISTS.has(field) && Array.isArray(v) && !v.length ? "Add at least one." : i?.message ?? "Check the value." };
  }
  return run((u) => patchProfile(u, p.data));
}

export async function saveVoiceSamples(samples: string[]): Promise<Result> {
  return run((u) => setVoiceSamples(u, samples));
}
