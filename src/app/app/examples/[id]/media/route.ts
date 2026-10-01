// An example's file, served only to its owner (row-level security does the scoping). Served with its
// sniffed type, never sniffed again by the browser, and sandboxed so a PDF can't run script.
import { examplesUser } from "@/lib/examples-access";
import { getMedia } from "@/services/examples";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await examplesUser(req.headers);
  if (user instanceof Response) return user;
  const { id } = await params;
  const media = UUID.test(id) ? await getMedia(user.id, id) : null;
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(media.data), {
    headers: {
      "content-type": media.mime, "content-length": String(media.data.length),
      "x-content-type-options": "nosniff", "content-disposition": "inline",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}
