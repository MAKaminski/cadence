"use server";
import { z } from "zod";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { aboutSchema, getProfile, lines, rhythmSchema, saveProfile, voiceSchema } from "@/services/profile";
import { resetPostingFromCadence } from "@/services/plan";
import { suggester, type SetupSuggestion } from "@/lib/setup-suggest";
import { trimmed, type LinkedInProfile } from "@/lib/linkedin-export";
import { track } from "@/lib/usage";

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
  const style = (await getProfile((await requireSubscriber()).id))?.style ?? []; // picked on the next step; keep it
  return save(1, { about: { role: p.data.role, audience: p.data.audience, goals: p.data.goals, style }, facts: lines(p.data.facts) });
}

export async function saveVoice(input: z.input<typeof voiceSchema>): Promise<Result> {
  const p = voiceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const cur = await getProfile((await requireSubscriber()).id);
  return save(2, {
    about: { role: cur?.role ?? "", audience: cur?.audience ?? "", goals: cur?.goals ?? "", style: p.data.style },
    voiceSamples: p.data.samples.filter(Boolean), topics: lines(p.data.topics.replace(/,/g, "\n")), noGo: lines(p.data.noGo.replace(/,/g, "\n")),
  });
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

const s = (n: number) => z.string().max(n).default("");
const linkedin = z.object({
  name: s(200), headline: s(400), summary: s(4000), industry: s(200), location: s(200),
  positions: z.array(z.object({ title: s(300), company: s(300), start: s(40), end: s(40), description: s(1000) })).max(20).default([]),
  education: z.array(z.object({ school: s(300), degree: s(300), end: s(40) })).max(10).default([]),
  skills: z.array(z.string().max(100)).max(60).default([]),
  posts: z.array(z.object({ date: s(40), text: s(6000) })).max(20).default([]),
});
const quickFillInput = z.object({
  linkedin: linkedin.optional(), pasted: z.string().max(30_000).optional(),
  role: s(200), audience: z.array(z.string().max(300)).max(10).default([]), goals: z.array(z.string().max(500)).max(10).default([]),
  facts: s(5000),
});

/** Quick fill: suggested answers for setup's first two steps, from the person's LinkedIn data and what they've typed. */
export async function quickFill(input: z.input<typeof quickFillInput>): Promise<{ ok: true; suggestion: SetupSuggestion } | { ok: false; error: string }> {
  const user = await requireSubscriber();
  const p = quickFillInput.safeParse(input);
  if (!p.success) return { ok: false, error: "That was more than quick fill can read. Upload the LinkedIn export as it came, or paste less." };
  const i = p.data;
  const sug = suggester();
  try {
    const { suggestion, usage } = await sug.suggest({
      name: user.name, linkedin: i.linkedin ? trimmed(i.linkedin as LinkedInProfile) : undefined, pasted: i.pasted,
      role: i.role, audience: i.audience, goals: i.goals, facts: lines(i.facts),
    });
    await track(user.id, { feature: "setup", action: "quick fill", costUsd: usage?.costUsd ?? 0, meta: { by: sug.name, from: suggestion.from } });
    return { ok: true, suggestion };
  } catch (e) {
    console.error("[quick fill]", e);
    return { ok: false, error: "Quick fill couldn't finish. Pick from the options below, or try again in a minute." };
  }
}
