"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { asUser } from "@/db";
import { inputs } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";

const checkin = z.object({ body: z.string().trim().min(20, "Give it a few sentences to work with.").max(4000) });

export async function saveCheckin(input: { body: string }) {
  const user = await requireSubscriber();
  const p = checkin.safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  await asUser(user.id, (tx) => tx.insert(inputs).values({ userId: user.id, kind: "checkin", body: p.data.body }));
  revalidatePath("/app");
  return { ok: true as const };
}
