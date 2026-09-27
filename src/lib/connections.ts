"use server";
// Assistants the user has connected through OAuth (Claude, Codex, Cursor, VS Code…), and disconnecting.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "@/db/schema";
import { requireUser } from "@/lib/session";

export async function disconnect(clientId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    await tx.delete(oauthConsent).where(and(eq(oauthConsent.userId, user.id), eq(oauthConsent.clientId, clientId)));
    await tx.delete(oauthAccessToken).where(and(eq(oauthAccessToken.userId, user.id), eq(oauthAccessToken.clientId, clientId)));
    await tx.delete(oauthRefreshToken).where(and(eq(oauthRefreshToken.userId, user.id), eq(oauthRefreshToken.clientId, clientId)));
  });
  revalidatePath("/app/settings");
  return { ok: true };
}
