// The user's one-time setup. Schemas live here (not in a "use server" file) so onboarding, Settings and
// the API validate the same way.
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import { resetPostingFromCadence } from "./plan";
import { ServiceError } from "./errors";

export const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MODELS = ["claude-sonnet-5", "claude-opus-5"] as const;

export const aboutSchema = z.object({
  role: z.string().trim().min(2, "Say what you do, in a few words.").max(200),
  audience: z.string().trim().min(2, "Who should these posts reach?").max(300),
  goals: z.string().trim().min(2, "What do you want posting to do for you?").max(500),
  facts: z.string().trim().min(10, "Add at least one fact. Cadence only states facts from this list.").max(5000),
});
export const voiceSchema = z.object({
  samples: z.array(z.string().trim()).length(3)
    .refine((a) => a.filter((s) => s.length >= 80).length >= 2, "Paste at least two posts of a few sentences each."),
  topics: z.string().trim().min(2, "Name a topic or two you want to be known for.").max(1000),
  noGo: z.string().trim().max(1000),
});
export const rhythmSchema = z.object({
  perWeek: z.coerce.number().int().min(1).max(5),
  days: z.array(z.enum(DAYS)).min(1, "Pick at least one day."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00."),
  tz: z.string().min(1),
  model: z.enum(MODELS),
});

export type Profile = {
  role: string; audience: string; goals: string; facts: string[];
  voiceSamples: string[]; topics: string[]; noGo: string[];
  cadence: { perWeek: number; days: string[]; time: string; tz: string };
  model: (typeof MODELS)[number]; autoPublish: boolean; setupComplete: boolean;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const [p] = await asUser(userId, (tx) => tx.select().from(profiles).where(eq(profiles.userId, userId)));
  if (!p) return null;
  const about = p.about as Record<string, string>;
  return {
    role: about.role ?? "", audience: about.audience ?? "", goals: about.goals ?? "",
    facts: p.facts as string[], voiceSamples: p.voiceSamples as string[], topics: p.topics as string[], noGo: p.noGo as string[],
    cadence: p.cadence as Profile["cadence"], model: p.model, autoPublish: p.autoPublish, setupComplete: p.onboardingStep > 3,
  };
}

/** Upsert part of the profile. `step` advances onboarding (never backwards). */
export async function saveProfile(userId: string, values: Partial<typeof profiles.$inferInsert>, step?: number) {
  const next = step ? step + 1 : 1;
  await asUser(userId, (tx) => tx.insert(profiles)
    .values({ userId, ...values, onboardingStep: next })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...values, ...(step ? { onboardingStep: sql`greatest(${profiles.onboardingStep}, ${next})` } : {}), updatedAt: new Date() },
    }));
}

/** API: change any subset of the setup, validated field by field with the onboarding rules. */
export const profilePatch = z.object({
  role: aboutSchema.shape.role, audience: aboutSchema.shape.audience, goals: aboutSchema.shape.goals,
  facts: z.array(z.string().trim().min(2).max(500)).min(1).max(100),
  topics: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
  noGo: z.array(z.string().trim().min(1).max(100)).max(100),
  cadence: rhythmSchema.omit({ model: true }),
  model: z.enum(MODELS),
}).partial();

export async function patchProfile(userId: string, patch: z.infer<typeof profilePatch>) {
  const current = await getProfile(userId);
  const values: Partial<typeof profiles.$inferInsert> = {};
  if (patch.role || patch.audience || patch.goals) values.about = { role: patch.role ?? current?.role, audience: patch.audience ?? current?.audience, goals: patch.goals ?? current?.goals };
  if (patch.facts) values.facts = patch.facts;
  if (patch.topics) values.topics = patch.topics;
  if (patch.noGo) values.noGo = patch.noGo;
  if (patch.cadence) values.cadence = patch.cadence;
  if (patch.model) values.model = patch.model;
  await saveProfile(userId, values);
  if (patch.cadence) await resetPostingFromCadence(userId);
  return getProfile(userId);
}

/** The three voice samples on their own, with setup's rule (at least two real posts). */
export async function setVoiceSamples(userId: string, samples: string[]) {
  const p = voiceSchema.shape.samples.safeParse(samples);
  if (!p.success) throw new ServiceError("invalid", p.error.issues[0]?.message ?? "Paste at least two posts.");
  await saveProfile(userId, { voiceSamples: p.data.filter(Boolean) });
}
