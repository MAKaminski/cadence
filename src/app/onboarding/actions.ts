"use server";
import type { z } from "zod";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { aboutSchema, lines, rhythmSchema, saveProfile, voiceSchema } from "@/services/profile";
import { resetPostingFromCadence } from "@/services/plan";

type Result = { ok: true } | { ok: false; error: string };

async function save(step: number, values: Partial<typeof profiles.$inferInsert>): Promise<Result> {
  const user = await requireSubscriber();
  await saveProfile(user.id, values, step);
  return { ok: true };
}

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Check the highlighted fields.";

export async function saveAbout(input: z.input<typeof aboutSchema>): Promise<Result> {
  const p = aboutSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  return save(1, { about: { role: p.data.role, audience: p.data.audience, goals: p.data.goals }, facts: lines(p.data.facts) });
}

export async function saveVoice(input: z.input<typeof voiceSchema>): Promise<Result> {
  const p = voiceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  return save(2, { voiceSamples: p.data.samples.filter(Boolean), topics: lines(p.data.topics.replace(/,/g, "\n")), noGo: lines(p.data.noGo.replace(/,/g, "\n")) });
}

export async function saveRhythm(input: z.input<typeof rhythmSchema>): Promise<Result> {
  const p = rhythmSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const { model, ...cadence } = p.data;
  const r = await save(3, { cadence, model });
  // Setup's rhythm is one posting slot; the planner holds the full picture and starts from it.
  if (r.ok) await resetPostingFromCadence((await requireSubscriber()).id);
  return r;
}
