// Profile photo. The LinkedIn picture (Better Auth's `user.image`) shows by default; a photo uploaded in
// Settings replaces it (see src/lib/avatar.ts for how an upload is checked and cropped).
import { and, eq, isNull } from "drizzle-orm";
import { asUser, db } from "@/db";
import { user, userAvatars } from "@/db/schema";
import { AVATAR_PATH, squareAvatar } from "@/lib/avatar";

export { AVATAR, AVATAR_PATH } from "@/lib/avatar";

export async function setAvatar(userId: string, upload: Buffer): Promise<{ version: number }> {
  const data = await squareAvatar(upload);
  const values = { mime: "image/webp", bytes: data.length, data, updatedAt: new Date() };
  await asUser(userId, (tx) => tx.insert(userAvatars).values({ userId, ...values })
    .onConflictDoUpdate({ target: userAvatars.userId, set: values }));
  return { version: values.updatedAt.getTime() };
}

/** "Use my LinkedIn photo": forget the upload. */
export async function removeAvatar(userId: string): Promise<void> {
  await asUser(userId, (tx) => tx.delete(userAvatars).where(eq(userAvatars.userId, userId)));
}

export async function getAvatar(userId: string) {
  const [a] = await asUser(userId, (tx) => tx.select({ mime: userAvatars.mime, data: userAvatars.data }).from(userAvatars).where(eq(userAvatars.userId, userId)));
  return a ?? null;
}

/** The photo to show for this person: their upload (versioned so a new one isn't cached), the LinkedIn
 *  picture, or none (the UI shows initials). */
export async function avatarFor(u: { id: string; image?: string | null }): Promise<{ src: string | null; uploaded: boolean; linkedin: string | null }> {
  const [a] = await asUser(u.id, (tx) => tx.select({ at: userAvatars.updatedAt }).from(userAvatars).where(eq(userAvatars.userId, u.id)));
  const linkedin = u.image && /^https:\/\//.test(u.image) ? u.image : null;
  if (a) return { src: `${AVATAR_PATH}?v=${a.at.getTime()}`, uploaded: true, linkedin };
  return { src: linkedin, uploaded: false, linkedin };
}

/** LinkedIn's OpenID profile picture for a token, or null. Only an https URL is accepted. */
export async function linkedinPicture(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchImpl("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const picture = ((await res.json()) as { picture?: unknown }).picture;
  return typeof picture === "string" && /^https:\/\//.test(picture) ? picture : null;
}

/**
 * Someone who signed up by email and connects LinkedIn later has no `user.image`: Better Auth sets it
 * only when LinkedIn creates the account. On every LinkedIn link or sign-in, fill it in if it's still
 * empty. Never overwrites a photo, and never fails the sign-in: a miss just means initials for now.
 */
export async function fillLinkedInPhoto(userId: string, getToken: () => Promise<string | undefined>, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const [u] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
    if (!u || u.image) return false;
    const token = await getToken();
    const picture = token ? await linkedinPicture(token, fetchImpl) : null;
    if (!picture) return false;
    const r = await db.update(user).set({ image: picture }).where(and(eq(user.id, userId), isNull(user.image))).returning({ id: user.id });
    return r.length > 0;
  } catch (e) {
    console.warn("Couldn't read the LinkedIn photo:", e instanceof Error ? e.message : e);
    return false;
  }
}
