"use server";
import { requireSubscriber } from "@/lib/session";
import { importEnginePosts, type EngineImportResult } from "@/services/engine-import";

/** One batch of a LinkedIn Engine export (the browser sends it in batches, so no request is large). */
export async function importEngineBatch(posts: unknown[]): Promise<{ ok: true; result: EngineImportResult } | { ok: false; error: string }> {
  const user = await requireSubscriber();
  if (!Array.isArray(posts) || posts.length > 200) return { ok: false, error: "Send at most 200 posts at a time." };
  try { return { ok: true, result: await importEnginePosts(user.id, posts) }; }
  catch (e) { console.error("[engine import]", e); return { ok: false, error: "Couldn't save those posts. Try again." }; }
}
