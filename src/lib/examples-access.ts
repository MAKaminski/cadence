import "server-only";
// Who may use Examples from a route handler: signed in, subscribed, and the `examples` flag on for them.
// Pages use requireSubscriber() (which redirects); route handlers answer with a status instead.
import { auth } from "@/lib/auth";
import { hasSubscription } from "@/services/account";
import { flagOn } from "@/lib/flags";

export async function examplesUser(headers: Headers): Promise<{ id: string; email: string } | Response> {
  const session = await auth.api.getSession({ headers });
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!(await hasSubscription(session.user.id))) return Response.json({ error: "Subscribe first." }, { status: 403 });
  if (!(await flagOn("examples", session.user))) return Response.json({ error: "Examples isn't on for your account yet." }, { status: 404 });
  return session.user;
}
