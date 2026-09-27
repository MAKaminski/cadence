import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { subscription } from "@/db/schema";

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}

/** Trialing or active subscription, else the user goes to checkout. The paywall lives here, on the
 *  server — proxy.ts only does a fast cookie check. */
export async function hasSubscription(userId: string) {
  const [row] = await db.select({ status: subscription.status }).from(subscription)
    .where(and(eq(subscription.referenceId, userId), inArray(subscription.status, ["trialing", "active"]))).limit(1);
  return Boolean(row);
}

export async function requireSubscriber() {
  const user = await requireUser();
  if (!(await hasSubscription(user.id))) redirect("/checkout");
  return user;
}
