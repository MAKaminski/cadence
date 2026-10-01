// Every chunk is in: the worker takes it from here.
import { respond, subscriber, UUID } from "@/lib/route-user";
import { finishUpload } from "@/services/history";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await subscriber(req.headers);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return respond(() => finishUpload(user.id, id));
}
