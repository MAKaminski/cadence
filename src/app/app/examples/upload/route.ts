// Upload one example file (multipart: file, optional note, rating and text). A route handler, not a
// server action, so the 5 MB cap is ours rather than the server-action body limit.
import { examplesUser } from "@/lib/examples-access";
import { EXAMPLES } from "@/lib/catalog";
import { addUpload } from "@/services/examples";
import { ServiceError, STATUS } from "@/services/errors";

const OVERHEAD = 64 * 1024; // multipart boundaries and the small text fields

export async function POST(req: Request) {
  const user = await examplesUser(req.headers);
  if (user instanceof Response) return user;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > EXAMPLES.maxBytes + OVERHEAD) return Response.json({ error: `That file is over the ${EXAMPLES.maxBytes / 1048576} MB limit.` }, { status: 413 });
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Send the file as a form upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload." }, { status: 422 });
  if (file.size > EXAMPLES.maxBytes) return Response.json({ error: `That file is over the ${EXAMPLES.maxBytes / 1048576} MB limit.` }, { status: 413 });
  const rating = form.get("rating");
  try {
    const example = await addUpload(user.id, Buffer.from(await file.arrayBuffer()), {
      name: file.name.slice(0, 200), note: String(form.get("note") ?? ""), body: String(form.get("body") ?? ""),
      rating: rating === "up" || rating === "down" ? rating : null,
    });
    return Response.json({ example }, { status: 201 });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: STATUS[e.code] });
    throw e;
  }
}
