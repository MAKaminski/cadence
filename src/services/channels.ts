// Channels: where posts go. Every channel in src/platforms/registry.ts, with this person's connection
// to it (if any). Connecting is OAuth (src/lib/auth.ts); this file lists, toggles and disconnects.
import { and, eq } from "drizzle-orm";
import { asUser, db } from "@/db";
import { account, platformAccounts } from "@/db/schema";
import { connectable, PLATFORMS, spec, type PlatformId } from "@/platforms/registry";
import { ServiceError } from "./errors";

export type ChannelView = {
  id: PlatformId; name: string; blurb: string; status: "live" | "planned"; needsMedia: boolean;
  /** Connect button available: live and its app keys set on this server. */
  connectable: boolean; provider: string; maxChars: number;
  connection: { status: string; handle: string | null; drafting: boolean; expiresAt: string | null } | null;
};

export async function listChannels(userId: string): Promise<ChannelView[]> {
  const rows = await asUser(userId, (tx) => tx.select().from(platformAccounts));
  return PLATFORMS.map((p) => {
    const c = rows.find((r) => r.platform === p.id && r.status !== "revoked");
    return {
      id: p.id, name: p.name, blurb: p.blurb, status: p.status, needsMedia: p.needsMedia, provider: p.provider,
      connectable: connectable(p.id), maxChars: p.limits.hardChars,
      connection: c ? { status: c.status, handle: c.handle, drafting: c.drafting, expiresAt: c.expiresAt?.toISOString() ?? null } : null,
    };
  });
}

/** Keep the connection but stop (or restart) new drafts for it. LinkedIn always drafts. */
export async function setDrafting(userId: string, id: PlatformId, on: boolean) {
  if (id === "linkedin") throw new ServiceError("invalid", "LinkedIn is where drafts start; it always drafts.");
  const r = await asUser(userId, (tx) => tx.update(platformAccounts).set({ drafting: on }).where(eq(platformAccounts.platform, id)).returning({ id: platformAccounts.id }));
  if (!r.length) throw new ServiceError("not_found", `${spec(id).name} isn't connected.`);
}

/** Forget a channel: its token and its connection. Posts already published stay on the platform.
 *  LinkedIn is disconnected from LinkedIn's own settings, since it may be how the person signs in. */
export async function disconnect(userId: string, id: PlatformId) {
  if (id === "linkedin") throw new ServiceError("invalid", "LinkedIn may be how you sign in. Revoke Cadence in LinkedIn's settings instead.");
  const s = spec(id);
  await db.delete(account).where(and(eq(account.userId, userId), eq(account.providerId, s.provider)));
  await asUser(userId, (tx) => tx.delete(platformAccounts).where(eq(platformAccounts.platform, id)));
}

/** Demo mode only: a connection that publishes to the recording publisher. */
export async function connectDemo(userId: string, id: PlatformId) {
  const s = spec(id);
  if (s.status !== "live") throw new ServiceError("invalid", `${s.name} is coming soon.`);
  await asUser(userId, (tx) => tx.insert(platformAccounts).values({ userId, platform: id, externalId: `${id}:demo`, handle: "Demo account" }).onConflictDoNothing());
}
