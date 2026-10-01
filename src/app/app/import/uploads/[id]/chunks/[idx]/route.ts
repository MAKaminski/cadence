// One chunk of an import upload, as the raw request body. Read with a limit, so a chunk can never be
// bigger than the upload's chunk size; sending a chunk again is harmless (that's how resuming works).
import { IMPORT } from "@/lib/catalog";
import { respond, subscriber, UUID } from "@/lib/route-user";
import { putChunk } from "@/services/history";

async function readCapped(req: Request, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const parts: Buffer[] = [];
  let n = 0;
  for await (const p of req.body as unknown as AsyncIterable<Uint8Array>) {
    n += p.length;
    if (n > max) return null;
    parts.push(Buffer.from(p));
  }
  return Buffer.concat(parts);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; idx: string }> }) {
  const user = await subscriber(req.headers);
  if (user instanceof Response) return user;
  const { id, idx } = await params;
  if (!UUID.test(id) || !/^\d{1,6}$/.test(idx)) return Response.json({ error: "Not found." }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > IMPORT.chunkBytes) return Response.json({ error: "That part is too large." }, { status: 413 });
  const data = await readCapped(req, IMPORT.chunkBytes);
  if (!data) return Response.json({ error: "That part is too large." }, { status: 413 });
  return respond(() => putChunk(user.id, id, Number(idx), data));
}
