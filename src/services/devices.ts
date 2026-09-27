import { and, eq } from "drizzle-orm";
import { asUser, db } from "@/db";
import { devices } from "@/db/schema";
import { ServiceError } from "./errors";

export type DeviceOut = { id: string; platform: "ios"; environment: "sandbox" | "production"; lastSeenAt: string };

/** Register (or re-register) an APNs token. A token moves to whoever registers it last, since one
 *  phone can change accounts; the old owner stops getting its notifications. */
export async function registerDevice(userId: string, token: string, environment: "sandbox" | "production"): Promise<DeviceOut> {
  if (!/^[0-9a-f]{32,200}$/i.test(token)) throw new ServiceError("invalid", "That isn't an APNs device token.");
  await db.delete(devices).where(and(eq(devices.token, token)));
  const [d] = await asUser(userId, (tx) => tx.insert(devices).values({ userId, platform: "ios", token, environment }).returning());
  return { id: d.id, platform: d.platform, environment: d.environment, lastSeenAt: d.lastSeenAt.toISOString() };
}

export async function unregisterDevice(userId: string, id: string) {
  const r = await asUser(userId, (tx) => tx.delete(devices).where(eq(devices.id, id)).returning({ id: devices.id }));
  if (!r.length) throw new ServiceError("not_found", "No device with that id.");
}
