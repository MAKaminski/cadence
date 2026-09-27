"use server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { deleteAccount } from "@/services/account";

/** Web Settings → Delete account. Same service as `DELETE /api/v1/account`. */
export async function deleteMyAccount(confirm: string): Promise<{ ok: boolean; error?: string }> {
  if (confirm !== "delete my account") return { ok: false, error: 'Type "delete my account" to confirm.' };
  const user = await requireUser();
  await deleteAccount(user.id);
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  return { ok: true };
}
