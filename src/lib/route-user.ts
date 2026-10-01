import "server-only";
// Who may call a signed-in route handler: signed in and subscribed. Pages use requireSubscriber()
// (which redirects); route handlers answer with a status instead.
import { auth } from "@/lib/auth";
import { hasSubscription } from "@/services/account";
import { ServiceError, STATUS } from "@/services/errors";

export async function subscriber(headers: Headers): Promise<{ id: string; email: string } | Response> {
  const session = await auth.api.getSession({ headers });
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!(await hasSubscription(session.user.id))) return Response.json({ error: "Subscribe first." }, { status: 403 });
  return session.user;
}

/** A service call as JSON: its result, or its ServiceError as the matching status. */
export async function respond<T>(fn: () => Promise<T>, status = 200): Promise<Response> {
  try { return Response.json(await fn(), { status }); }
  catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: STATUS[e.code] });
    throw e;
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
