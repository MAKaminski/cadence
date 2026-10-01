"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

const nameSchema = z.string().trim().min(1, "Enter a name.").max(80, "Keep it under 80 characters.");

/** Settings → Profile: the name shown across Cadence (Better Auth's `user.name`). */
export async function saveName(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await auth.api.updateUser({ headers: await headers(), body: { name: parsed.data } });
  revalidatePath("/app", "layout"); // the sidebar shows the name too
  return { ok: true };
}
