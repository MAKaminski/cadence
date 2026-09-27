import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasSubscription } from "@/services/account";

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}

export { hasSubscription };

export async function requireSubscriber() {
  const user = await requireUser();
  if (!(await hasSubscription(user.id))) redirect("/checkout");
  return user;
}
