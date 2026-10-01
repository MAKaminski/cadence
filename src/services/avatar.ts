// Profile photo. The LinkedIn picture (Better Auth's `user.image`) shows by default; a photo uploaded in
// Settings replaces it (see src/lib/avatar.ts for how an upload is checked and cropped).
import { eq } from "drizzle-orm";
import { asUser } from "@/db";
import { userAvatars } from "@/db/schema";
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
