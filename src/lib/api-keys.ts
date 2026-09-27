"use server";
// API keys for the public API and CLI. Scopes and limits are server-side properties of the key: a
// browser can't grant itself `approve`.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, API_LIMIT } from "@/lib/auth";
import { requireSubscriber } from "@/lib/session";

const input = z.object({
  name: z.string().trim().min(1, "Name the key, e.g. \"laptop CLI\".").max(60),
  write: z.boolean(),
  approve: z.boolean(),
});

export async function createKey(v: z.input<typeof input>): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const user = await requireSubscriber();
  const p = input.safeParse(v);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const scopes = ["read", ...(p.data.write ? ["write"] : []), ...(p.data.approve ? ["approve"] : [])];
  const k = await auth.api.createApiKey({ body: {
    userId: user.id, name: p.data.name, permissions: { cadence: scopes },
    rateLimitEnabled: true, rateLimitMax: API_LIMIT.max, rateLimitTimeWindow: API_LIMIT.windowMs,
    expiresIn: 60 * 60 * 24 * 365, // a year; create a new one after that
  } });
  revalidatePath("/app/settings");
  return { ok: true, key: k.key };
}

export async function revokeKey(keyId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSubscriber();
  try {
    await auth.api.deleteApiKey({ body: { keyId }, headers: await headers() });
    revalidatePath("/app/settings");
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
