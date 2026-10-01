// An import's state, for the progress bar while the worker reads it.
import { respond, subscriber, UUID } from "@/lib/route-user";
import { getImport } from "@/services/history";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await subscriber(req.headers);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return respond(() => getImport(user.id, id));
}
