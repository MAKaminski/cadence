// Push notifications to the iOS app (APNs, token auth via the `apns2` library). Same "real or demo"
// pattern as the writer and the publisher: in demo mode, and whenever APNs keys aren't configured,
// notifications are recorded and logged instead of sent. Notifications only ever *open* a screen;
// nothing can be approved from a notification.
import { ApnsClient, Notification, Host, type ApnsError } from "apns2";
import { eq } from "drizzle-orm";
import { asWorker } from "@/db";
import { devices } from "@/db/schema";
import { isDemo } from "@/lib/mode";

import { message, type PushMessage, type PushEvent } from "./push-message";
export { message, type PushMessage, type PushEvent };

/** Demo-mode outbox, for tests and the demo. */
export const demoOutbox: { userId: string; token: string; message: PushMessage }[] = [];

let client: ApnsClient | null = null;
function apns(environment: "sandbox" | "production") {
  const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, IOS_BUNDLE_ID } = process.env;
  if (isDemo() || !APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID || !IOS_BUNDLE_ID) return null;
  client ??= new ApnsClient({
    team: APNS_TEAM_ID, keyId: APNS_KEY_ID, signingKey: APNS_KEY.replace(/\\n/g, "\n"), defaultTopic: IOS_BUNDLE_ID,
    host: environment === "production" ? Host.production : Host.development,
  });
  return client;
}

/** Send to every device the user has. Returns how many were delivered (or recorded, in demo). */
export async function push(userId: string, event: PushEvent): Promise<number> {
  const targets = await asWorker((tx) => tx.select().from(devices).where(eq(devices.userId, userId)));
  const m = message(event);
  let sent = 0;
  for (const d of targets) {
    const c = apns(d.environment);
    if (!c) { demoOutbox.push({ userId, token: d.token, message: m }); console.log(`[push] ${userId} ${m.title}`); sent++; continue; }
    try {
      await c.send(new Notification(d.token, {
        alert: { title: m.title, body: m.body }, sound: "default", threadId: "cadence",
        collapseId: m.collapseId, data: { screen: m.screen },
      }));
      sent++;
    } catch (e) {
      const err = e as ApnsError;
      // 410 Unregistered / 400 BadDeviceToken: the token is dead; forget it.
      if (err.statusCode === 410 || err.reason === "BadDeviceToken" || err.reason === "Unregistered") {
        await asWorker((tx) => tx.delete(devices).where(eq(devices.id, d.id)));
      } else console.error(`[push] ${err.statusCode ?? ""} ${err.reason ?? err.message}`);
    }
  }
  return sent;
}
