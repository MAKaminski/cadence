// Examples: posts and visuals a person points at (a URL) or uploads, rated thumbs up or down. Each is
// read once by the analyst for its structure; the rated analyses become a short "copy this, avoid
// that" block in every drafting brief. Behind the `examples` flag; every action is a usage event.
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { exampleMedia, examples, profiles } from "@/db/schema";
import { EXAMPLES } from "@/lib/catalog";
import { fetchSafe, FetchRefused } from "@/lib/fetch-safe";
import { mediaKindOf, parsePreview, sniff, UPLOAD_TYPES, type Preview } from "@/lib/link-preview";
import { analyst, type AnalysisT } from "@/lib/example-analysis";
import { enqueue } from "@/lib/jobs";
import { spend } from "@/lib/drafting";
import { track, trackTx } from "@/lib/usage";
import type { Model } from "@/lib/llm";
import { guidanceFrom, type Guidance, type Rating } from "@/lib/example-guidance";
import { ServiceError } from "./errors";

export { guidanceText, type Guidance, type Rating } from "@/lib/example-guidance";

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
type Row = typeof examples.$inferSelect;
const FEATURE = "examples";
const MB = Math.round(EXAMPLES.maxBytes / 1048576);

const view = (r: Row) => ({
  id: r.id, source: r.source, url: r.url, title: r.title, author: r.author, body: r.body,
  mediaKind: r.mediaKind, mediaMime: r.mediaMime, mediaBytes: r.mediaBytes, rating: r.rating, note: r.note,
  analysis: r.analysisStatus === "done" ? (r.analysis as AnalysisT) : null,
  analysisStatus: r.analysisStatus, analysisError: r.analysisError,
  createdAt: r.createdAt.toISOString(), ratedAt: r.ratedAt?.toISOString() ?? null,
});
export type ExampleView = ReturnType<typeof view>;

type Media = { mime: string; data: Buffer } | null;
type NewExample = { source: "url" | "upload"; url: string | null; title: string | null; author: string | null; body: string | null; note: string | null; rating: Rating | null; media: Media };

const clean = (s: string | null | undefined, max: number) => { const t = (s ?? "").trim(); return t ? t.slice(0, max) : null; };

/** Past the cap, the oldest unrated examples make room; rated ones are never dropped silently. */
async function makeRoom(tx: Tx) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(examples);
  if (n < EXAMPLES.maxPerUser) return;
  const [oldest] = await tx.select({ id: examples.id }).from(examples).where(isNull(examples.rating)).orderBy(asc(examples.createdAt)).limit(1);
  if (!oldest) throw new ServiceError("limit", `You have ${EXAMPLES.maxPerUser} rated examples, the most Cadence keeps. Delete one to add another.`);
  await tx.delete(examples).where(eq(examples.id, oldest.id));
}

async function insert(userId: string, e: NewExample, action: string): Promise<ExampleView> {
  return asUser(userId, async (tx) => {
    await makeRoom(tx);
    const [row] = await tx.insert(examples).values({
      userId, source: e.source, url: e.url, title: clean(e.title, 300), author: clean(e.author, 120), body: clean(e.body, EXAMPLES.bodyChars),
      note: clean(e.note, 500), rating: e.rating, ratedAt: e.rating ? new Date() : null,
      mediaKind: e.media ? mediaKindOf(e.media.mime) : "none", mediaMime: e.media?.mime ?? null, mediaBytes: e.media?.data.length ?? null,
    }).returning();
    if (e.media) await tx.insert(exampleMedia).values({ exampleId: row.id, userId, mime: e.media.mime, bytes: e.media.data.length, data: e.media.data });
    await enqueue(tx, userId, "analyze_example", row.id);
    await trackTx(tx, userId, { feature: FEATURE, action, bytes: e.media?.data.length ?? 0, meta: { kind: row.mediaKind } });
    // A rating given while adding counts as a rating, the same as one given later.
    if (e.rating) await trackTx(tx, userId, { feature: FEATURE, action: `rate_${e.rating}`, meta: { atAdd: true } });
    return view(row);
  });
}

/** A file we keep: one of the upload types, by its bytes (not its name or claimed type), under the cap. */
function acceptMedia(data: Buffer): Media {
  if (data.length > EXAMPLES.maxBytes) throw new ServiceError("invalid", `That file is over the ${MB} MB limit.`);
  const mime = sniff(data);
  if (!mime || !(UPLOAD_TYPES as readonly string[]).includes(mime)) {
    throw new ServiceError("invalid", "That file type isn't supported. Use PNG, JPEG, WebP, GIF, MP4, WebM, MOV or PDF.");
  }
  return { mime, data };
}

/** Fetch a page's preview image or video; a missing or oversized one just means no media. */
async function fetchMedia(p: Preview): Promise<Media> {
  for (const u of [p.image, p.video]) {
    if (!u) continue;
    try { return acceptMedia((await fetchSafe(u)).body); } catch { /* try the next, or none */ }
  }
  return null;
}

export async function addUrl(userId: string, raw: string, opts: { note?: string; rating?: Rating | null } = {}): Promise<ExampleView> {
  let page;
  try { page = await fetchSafe(raw); }
  catch (e) { throw new ServiceError("invalid", e instanceof FetchRefused ? e.message : "Couldn't reach that page."); }
  const base = { source: "url" as const, url: page.url, note: opts.note ?? null, rating: opts.rating ?? null };
  // A direct link to an image, GIF, video or PDF is kept as the file itself.
  if (!page.contentType.startsWith("text/html") && !page.contentType.includes("xml")) {
    const media = acceptMedia(page.body);
    return insert(userId, { ...base, title: decodeURIComponent(new URL(page.url).pathname.split("/").pop() || "") || null, author: null, body: null, media }, "add_url");
  }
  const p = parsePreview(page.body.toString("utf8"), page.url);
  return insert(userId, { ...base, title: p.title, author: p.author, body: p.body, media: await fetchMedia(p) }, "add_url");
}

export async function addUpload(userId: string, data: Buffer, opts: { name?: string; note?: string; body?: string; rating?: Rating | null } = {}): Promise<ExampleView> {
  const media = acceptMedia(data);
  return insert(userId, { source: "upload", url: null, title: opts.name ?? null, author: null, body: opts.body ?? null, note: opts.note ?? null, rating: opts.rating ?? null, media }, "add_upload");
}

export async function list(userId: string): Promise<ExampleView[]> {
  return asUser(userId, async (tx) => (await tx.select().from(examples).orderBy(desc(examples.createdAt))).map(view));
}

/** Thumbs up, thumbs down, or `null` to clear. */
export async function rate(userId: string, id: string, rating: Rating | null): Promise<ExampleView> {
  return asUser(userId, async (tx) => {
    const [row] = await tx.update(examples).set({ rating, ratedAt: rating ? new Date() : null }).where(eq(examples.id, id)).returning();
    if (!row) throw new ServiceError("not_found", "That example is gone.");
    await trackTx(tx, userId, { feature: FEATURE, action: rating ? `rate_${rating}` : "rate_clear" });
    return view(row);
  });
}

export async function setNote(userId: string, id: string, note: string): Promise<void> {
  await asUser(userId, async (tx) => {
    const r = await tx.update(examples).set({ note: clean(note, 500) }).where(eq(examples.id, id)).returning({ id: examples.id });
    if (!r.length) throw new ServiceError("not_found", "That example is gone.");
  });
}

export async function remove(userId: string, id: string): Promise<void> {
  await asUser(userId, async (tx) => {
    const r = await tx.delete(examples).where(eq(examples.id, id)).returning({ bytes: examples.mediaBytes });
    if (!r.length) throw new ServiceError("not_found", "That example is gone.");
    await trackTx(tx, userId, { feature: FEATURE, action: "delete", bytes: r[0].bytes ?? 0 });
  });
}

/** Analyse again (after a failure, or once the person has added a note). */
export async function reanalyze(userId: string, id: string): Promise<void> {
  await asUser(userId, async (tx) => {
    const r = await tx.update(examples).set({ analysisStatus: "pending", analysisError: null }).where(eq(examples.id, id)).returning({ id: examples.id });
    if (!r.length) throw new ServiceError("not_found", "That example is gone.");
    await enqueue(tx, userId, "analyze_example", id, new Date());
  });
}

export async function getMedia(userId: string, id: string) {
  const [m] = await asUser(userId, (tx) => tx.select({ mime: exampleMedia.mime, data: exampleMedia.data }).from(exampleMedia).where(eq(exampleMedia.exampleId, id)));
  return m ?? null;
}

/** The worker's job: read one example and store how it works. Charged against the monthly allowance. */
export async function runAnalysis(userId: string, id: string): Promise<string | void> {
  const loaded = await asUser(userId, async (tx) => {
    const [row] = await tx.select().from(examples).where(eq(examples.id, id));
    if (!row) return null;
    const [m] = row.mediaMime ? await tx.select({ mime: exampleMedia.mime, data: exampleMedia.data }).from(exampleMedia).where(eq(exampleMedia.exampleId, id)) : [];
    const [p] = await tx.select({ model: profiles.model }).from(profiles).where(eq(profiles.userId, userId));
    return { row, media: m ?? null, model: (p?.model ?? "claude-sonnet-5") as Model };
  });
  if (!loaded) return "example deleted";
  const { row, media, model } = loaded;
  if (!row.body && !media && !row.title) {
    await asUser(userId, (tx) => tx.update(examples).set({ analysisStatus: "skipped", analysisError: "Nothing to read: no text or image came with it." }).where(eq(examples.id, id)));
    return "nothing to read";
  }
  const out: { analysis?: AnalysisT } = {};
  try {
    const usage = await spend(userId, async () => {
      const r = await analyst().analyze({ url: row.url, title: row.title, author: row.author, body: row.body, note: row.note, mediaKind: row.mediaKind, image: media }, model);
      out.analysis = r.analysis;
      return r.usage;
    });
    const analysis = out.analysis!;
    await asUser(userId, async (tx) => {
      await tx.update(examples).set({ analysis, analysisStatus: "done", analysisError: null }).where(eq(examples.id, id));
      await trackTx(tx, userId, { feature: FEATURE, action: "analyze", costUsd: usage.costUsd, meta: { model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut } });
    });
    return analysis.summary;
  } catch (e) {
    // Not retried automatically (each try costs money): the page shows the reason and a "Try again".
    const msg = (e as Error).message.slice(0, 300);
    await asUser(userId, (tx) => tx.update(examples).set({ analysisStatus: "failed", analysisError: msg }).where(eq(examples.id, id)));
    await track(userId, { feature: FEATURE, action: "analyze_failed", meta: { error: msg } });
    return `failed: ${msg}`;
  }
}

export async function guidance(userId: string): Promise<Guidance> {
  const rows = await asUser(userId, (tx) => tx.select({ rating: examples.rating, analysis: examples.analysis }).from(examples)
    .where(and(inArray(examples.rating, ["up", "down"]), eq(examples.analysisStatus, "done"))).orderBy(desc(examples.ratedAt)));
  return guidanceFrom(rows.map((r) => ({ rating: r.rating, analysis: r.analysis as AnalysisT })));
}
