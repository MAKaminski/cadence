"use server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

const aboutSchema = z.object({
  role: z.string().trim().min(2, "Say what you do, in a few words.").max(200),
  audience: z.string().trim().min(2, "Who should these posts reach?").max(300),
  goals: z.string().trim().min(2, "What do you want posting to do for you?").max(500),
  facts: z.string().trim().min(10, "Add at least one fact. Cadence only states facts from this list.").max(5000),
});

const voiceSchema = z.object({
  samples: z.array(z.string().trim()).length(3)
    .refine((a) => a.filter((s) => s.length >= 80).length >= 2, "Paste at least two posts of a few sentences each."),
  topics: z.string().trim().min(2, "Name a topic or two you want to be known for.").max(1000),
  noGo: z.string().trim().max(1000),
});

const rhythmSchema = z.object({
  perWeek: z.coerce.number().int().min(1).max(5),
  days: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).min(1, "Pick at least one day."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00."),
  tz: z.string().min(1),
  model: z.enum(["claude-sonnet-5", "claude-opus-5"]),
});

type Result = { ok: true } | { ok: false; error: string };

async function save(step: number, values: Partial<typeof profiles.$inferInsert>): Promise<Result> {
  const user = await requireSubscriber();
  await asUser(user.id, (tx) => tx.insert(profiles)
    .values({ userId: user.id, ...values, onboardingStep: step + 1 })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...values, onboardingStep: sql`greatest(${profiles.onboardingStep}, ${step + 1})`, updatedAt: new Date() },
    }));
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
  return save(3, { cadence, model });
}
