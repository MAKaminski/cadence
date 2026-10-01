// Start (or resume) an import upload: { source, name, size } -> the upload, its chunk size, and the
// chunks already received. The file itself follows in chunks (./[id]/chunks/[idx]).
import { respond, subscriber } from "@/lib/route-user";
import { startUpload } from "@/services/history";

export async function POST(req: Request) {
  const user = await subscriber(req.headers);
  if (user instanceof Response) return user;
  const body = await req.json().catch(() => null) as { source?: unknown; name?: unknown; size?: unknown } | null;
  return respond(() => startUpload(user.id, { source: String(body?.source ?? ""), name: String(body?.name ?? ""), size: Number(body?.size) }), 201);
}
