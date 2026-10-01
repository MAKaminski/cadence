// The signed-in person's own profile photo: GET serves it (only to them; row-level security does the
// scoping), POST replaces it (multipart `file`), DELETE goes back to the LinkedIn picture. A route
// handler, not a server action, so the 2 MB cap is ours rather than the server-action body limit.
import { auth } from "@/lib/auth";
import { AVATAR, getAvatar, removeAvatar, setAvatar } from "@/services/avatar";
import { ServiceError, STATUS } from "@/services/errors";

const OVERHEAD = 16 * 1024; // multipart boundaries
const TOO_BIG = { error: "That photo is over the 2 MB limit." };

async function signedIn(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user ?? null;
}

export async function GET(req: Request) {
  const user = await signedIn(req);
  if (!user) return new Response("Not found", { status: 404 });
  const photo = await getAvatar(user.id);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.mime, "content-length": String(photo.data.length),
      "x-content-type-options": "nosniff", "content-disposition": "inline",
      "content-security-policy": "default-src 'none'; sandbox",
      // The URL carries a version (?v=), so a new photo is a new URL; private keeps it out of shared caches.
      "cache-control": "private, max-age=86400",
    },
  });
}

export async function POST(req: Request) {
  const user = await signedIn(req);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > AVATAR.maxBytes + OVERHEAD) return Response.json(TOO_BIG, { status: 413 });
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Send the photo as a form upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a photo to upload." }, { status: 422 });
  if (file.size > AVATAR.maxBytes) return Response.json(TOO_BIG, { status: 413 });
  try {
    return Response.json(await setAvatar(user.id, Buffer.from(await file.arrayBuffer())), { status: 201 });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: STATUS[e.code] });
    throw e;
  }
}

export async function DELETE(req: Request) {
  const user = await signedIn(req);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  await removeAvatar(user.id);
  return new Response(null, { status: 204 });
}
