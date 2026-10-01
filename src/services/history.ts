// AI history import: a ChatGPT or Claude export becomes suggestions for the profile.
//   1. Upload: the browser sends the file in 4 MB chunks (resumable: chunks already received are skipped).
//   2. Read (worker): the zip's directory, then each conversations file streamed through zlib and a JSON
//      splitter, one conversation at a time. Only the person's own messages are kept, once each.
//      The uploaded file is deleted as soon as it has been read.
//   3. Distil (worker): a sample of those messages, as excerpts, goes to the model in batches (map), and
//      the candidates are merged once (reduce), under the monthly allowance.
//   4. Review: nothing reaches the profile until the person accepts it.
// Every step is a usage event (feature "import").
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { historyChunks, historyImports, historyMessages, historySuggestions, profiles } from "@/db/schema";
import { IMPORT } from "@/lib/catalog";
import { enqueue } from "@/lib/jobs";
import { CapReached, spend } from "@/lib/drafting";
import { track, trackTx } from "@/lib/usage";
import { entries, isZip, open, ZipError, type ByteSource } from "@/lib/zip";
import { elements, JsonStreamError, type SplitReport } from "@/lib/json-stream";
import {
  batches, clean, countTerms, evidenceFor, hashOf, isConversationsFile, isNoise, pick, readConversation, same, selfScore, topTerms, unwrap, voiceScore,
  type Pooled, type Source,
} from "@/lib/history";
import { distiller, mockDistiller, type Excerpt, type Found, type Merged } from "@/lib/history-distill";
import { saveCheckin } from "./drafts";
import { ServiceError } from "./errors";

const FEATURE = "import";
export const SOURCES = ["chatgpt", "claude"] as const;
export const SOURCE_NAME: Record<Source, string> = { chatgpt: "ChatGPT", claude: "Claude" };
const ACTIVE = ["uploading", "queued", "reading", "distilling"] as const;

/** A problem with the file itself, shown to the person as is. */
export class HistoryError extends Error {}

type Row = typeof historyImports.$inferSelect;
type Suggestion = typeof historySuggestions.$inferSelect;
export type Kind = Suggestion["kind"];
type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

export type ImportStats = {
  conversations?: number; messages?: number; kept?: number; duplicates?: number; noise?: number; skipped?: number; empty?: number;
  detected?: Partial<Record<Source, number>>; batches?: number; batchesRead?: number; excerpts?: number;
  suggestions?: Partial<Record<Kind, number>>; notes?: string[];
};
export type ImportProgress = { stage?: "uploading" | "reading" | "distilling"; done?: number; total?: number };

const view = (r: Row) => ({
  id: r.id, source: r.source, fileName: r.fileName, bytes: r.bytes, chunks: r.chunks, chunkBytes: r.chunkBytes, status: r.status,
  progress: r.progress as ImportProgress, stats: r.stats as ImportStats, costUsd: Number(r.costUsd), error: r.error,
  createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
});
export type ImportView = ReturnType<typeof view>;

const suggestionView = (s: Suggestion) => ({ id: s.id, importId: s.importId, kind: s.kind, body: s.body, evidence: s.evidence, status: s.status });
export type SuggestionView = ReturnType<typeof suggestionView>;

// ---------------------------------------------------------------------------------------------
// Upload

/** Start an upload, or pick up the unfinished one for the same file (same source, name and size).
 *  `chunkBytes` is for tests, which exercise reads across many small chunks. */
export async function startUpload(userId: string, input: { source: string; name: string; size: number }, chunkBytes: number = IMPORT.chunkBytes) {
  const source = SOURCES.find((s) => s === input.source);
  const name = (input.name ?? "").trim().slice(0, 200);
  if (!source) throw new ServiceError("invalid", "Choose ChatGPT or Claude.");
  if (!/\.(zip|json)$/i.test(name)) throw new ServiceError("invalid", "Upload the .zip your export came in, or the conversations.json inside it.");
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new ServiceError("invalid", "That file is empty.");
  if (input.size > IMPORT.maxBytes) throw new ServiceError("invalid", `That file is over the ${IMPORT.maxBytes / 1073741824} GB limit.`);
  return asUser(userId, async (tx) => {
    const open = await tx.select().from(historyImports).where(inArray(historyImports.status, [...ACTIVE]));
    if (open.some((r) => r.status !== "uploading")) throw new ServiceError("conflict", "An import is still being read. Wait for it to finish, then add another.");
    const resume = open.find((r) => r.source === source && r.fileName === name && r.bytes === input.size);
    // Any other unfinished upload is dropped, with its chunks.
    for (const r of open) if (r !== resume) await tx.delete(historyImports).where(eq(historyImports.id, r.id));
    const row = resume ?? (await tx.insert(historyImports).values({
      userId, source, fileName: name, bytes: input.size, chunkBytes, chunks: Math.ceil(input.size / chunkBytes),
      progress: { stage: "uploading", done: 0, total: input.size },
    }).returning())[0];
    const received = (await tx.select({ idx: historyChunks.idx }).from(historyChunks).where(eq(historyChunks.importId, row.id))).map((c) => c.idx);
    if (!resume) await trackTx(tx, userId, { feature: FEATURE, action: "upload_start", bytes: input.size, meta: { source } });
    return { import: view(row), received };
  });
}

const looksJson = (b: Buffer) => { const t = b.subarray(0, 64).toString("utf8").replace(/^﻿/, "").trimStart(); return t.startsWith("[") || t.startsWith("{"); };

/** Store one chunk. Sending the same chunk twice is harmless. */
export async function putChunk(userId: string, id: string, idx: number, data: Buffer) {
  if (idx === 0 && data.length && !isZip(data) && !looksJson(data)) {
    // Refused before the rest of the file is sent; the upload goes (only if it is this person's).
    const gone = await asUser(userId, (tx) => tx.delete(historyImports).where(and(eq(historyImports.id, id), eq(historyImports.status, "uploading"))).returning({ id: historyImports.id }));
    if (gone.length) throw new ServiceError("invalid", "That isn't a ChatGPT or Claude export. Upload the .zip as it came, or the conversations.json inside it.");
  }
  return asUser(userId, async (tx) => {
    const [row] = await tx.select().from(historyImports).where(eq(historyImports.id, id));
    if (!row) throw new ServiceError("not_found", "That upload is gone. Start again.");
    if (row.status !== "uploading") throw new ServiceError("conflict", "That upload is already complete.");
    if (!Number.isInteger(idx) || idx < 0 || idx >= row.chunks) throw new ServiceError("invalid", "That part of the file doesn't belong to this upload.");
    const expected = idx === row.chunks - 1 ? row.bytes - idx * row.chunkBytes : row.chunkBytes;
    if (data.length !== expected) throw new ServiceError("invalid", `Part ${idx + 1} arrived incomplete. It will be sent again.`);
    await tx.insert(historyChunks).values({ importId: id, userId, idx, data }).onConflictDoNothing();
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(historyChunks).where(eq(historyChunks.importId, id));
    await tx.update(historyImports).set({ updatedAt: new Date(), progress: { stage: "uploading", done: Math.min(n * row.chunkBytes, row.bytes), total: row.bytes } })
      .where(eq(historyImports.id, id));
    return { received: n, chunks: row.chunks };
  });
}

/** Every chunk is in: hand the file to the worker. */
export async function finishUpload(userId: string, id: string): Promise<ImportView> {
  return asUser(userId, async (tx) => {
    const [row] = await tx.select().from(historyImports).where(eq(historyImports.id, id));
    if (!row) throw new ServiceError("not_found", "That upload is gone. Start again.");
    if (row.status !== "uploading") return view(row);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(historyChunks).where(eq(historyChunks.importId, id));
    if (n < row.chunks) throw new ServiceError("conflict", `${row.chunks - n} part${row.chunks - n > 1 ? "s" : ""} of the file haven't arrived yet.`);
    const [done] = await tx.update(historyImports).set({ status: "queued", progress: { stage: "reading", done: 0, total: row.bytes }, updatedAt: new Date() })
      .where(eq(historyImports.id, id)).returning();
    await enqueue(tx, userId, "import_history", id);
    await trackTx(tx, userId, { feature: FEATURE, action: "upload_done", bytes: row.bytes, meta: { source: row.source, chunks: row.chunks } });
    return view(done);
  });
}

export async function getImport(userId: string, id: string): Promise<ImportView> {
  const [row] = await asUser(userId, (tx) => tx.select().from(historyImports).where(eq(historyImports.id, id)));
  if (!row) throw new ServiceError("not_found", "That import is gone.");
  return view(row);
}

/** Everything the review page shows: imports newest first, and suggestions not yet dismissed. */
export async function overview(userId: string) {
  return asUser(userId, async (tx) => {
    const imports = (await tx.select().from(historyImports).orderBy(desc(historyImports.createdAt))).map(view);
    const suggestions = (await tx.select().from(historySuggestions).where(inArray(historySuggestions.status, ["pending", "accepted"]))
      .orderBy(asc(historySuggestions.createdAt))).map(suggestionView);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(historyMessages);
    return { imports, suggestions, messages: n };
  });
}

// ---------------------------------------------------------------------------------------------
// Review

const COLUMN = { fact: "facts", topic: "topics", no_go: "noGo", voice: "voiceSamples" } as const;
const CAP = { fact: 100, topic: 30, no_go: 100 } as const;
const SAMPLES = 3;

async function applyToProfile(tx: Tx, userId: string, kind: Exclude<Kind, "idea">, body: string): Promise<string> {
  const col = COLUMN[kind];
  const [p] = await tx.select({ facts: profiles.facts, topics: profiles.topics, noGo: profiles.noGo, voiceSamples: profiles.voiceSamples })
    .from(profiles).where(eq(profiles.userId, userId)).for("update");
  const list = [...((p?.[col] as string[] | undefined) ?? [])];
  if (list.some((x) => same(x) === same(body))) return "Already in your profile.";
  let message = { fact: "Added to your facts.", topic: "Added to your topics.", no_go: "Added to never write about.", voice: "Added to your sample posts." }[kind];
  if (kind === "voice") {
    if (list.filter(Boolean).length < SAMPLES) list.splice(list.findIndex((x) => !x) >= 0 ? list.findIndex((x) => !x) : list.length, 1, body);
    else {
      const shortest = list.reduce((m, x, i) => (x.length < list[m].length ? i : m), 0);
      list[shortest] = body;
      message = "Replaced your shortest sample post with it.";
    }
  } else {
    if (list.length >= CAP[kind]) throw new ServiceError("limit", `Your profile already has ${CAP[kind]} of these. Remove one in Setup first.`);
    list.push(body);
  }
  await tx.insert(profiles).values({ userId, [col]: list })
    .onConflictDoUpdate({ target: profiles.userId, set: { [col]: list, updatedAt: new Date() } });
  return message;
}

/** Accept (adds it to the profile; an idea is kept for drafting) or dismiss one suggestion. */
export async function decide(userId: string, id: string, choice: "accept" | "dismiss"): Promise<string> {
  return asUser(userId, async (tx) => {
    const [s] = await tx.select().from(historySuggestions).where(eq(historySuggestions.id, id));
    if (!s) throw new ServiceError("not_found", "That suggestion is gone.");
    if (s.status !== "pending") throw new ServiceError("conflict", "You've already decided on that one.");
    const message = choice === "dismiss" ? "Dismissed." : s.kind === "idea" ? "Saved to your ideas." : await applyToProfile(tx, userId, s.kind, s.body);
    await tx.update(historySuggestions).set({ status: choice === "accept" ? "accepted" : "dismissed", decidedAt: new Date() }).where(eq(historySuggestions.id, id));
    await trackTx(tx, userId, { feature: FEATURE, action: `${choice}_${s.kind}` });
    return message;
  });
}

/** Turn an idea into this week's check-in: the usual drafting runs on it. */
export async function draftIdea(userId: string, id: string) {
  const [s] = await asUser(userId, (tx) => tx.select().from(historySuggestions).where(eq(historySuggestions.id, id)));
  if (!s || s.kind !== "idea") throw new ServiceError("not_found", "That idea is gone.");
  const checkin = await saveCheckin(userId, `A post idea from my AI history: ${s.body}`);
  await asUser(userId, async (tx) => {
    if (s.status === "pending") await tx.update(historySuggestions).set({ status: "accepted", decidedAt: new Date() }).where(eq(historySuggestions.id, id));
    await trackTx(tx, userId, { feature: FEATURE, action: "draft_idea" });
  });
  return checkin;
}

/** Delete every import: the files, the messages kept from them and every suggestion. What was
 *  accepted into the profile stays there, where it can be edited like anything else. */
export async function deleteAll(userId: string): Promise<number> {
  return asUser(userId, async (tx) => {
    const gone = await tx.delete(historyImports).returning({ bytes: historyImports.bytes });
    await trackTx(tx, userId, { feature: FEATURE, action: "delete", bytes: gone.reduce((a, r) => a + r.bytes, 0), meta: { imports: gone.length } });
    return gone.length;
  });
}

// ---------------------------------------------------------------------------------------------
// Worker

/** The upload's chunks as a ByteSource, one chunk in memory at a time. */
function chunkSource(userId: string, row: Row): ByteSource {
  let cache: { idx: number; data: Buffer } | null = null;
  const chunk = async (idx: number) => {
    if (cache?.idx === idx) return cache.data;
    const [c] = await asUser(userId, (tx) => tx.select({ data: historyChunks.data }).from(historyChunks)
      .where(and(eq(historyChunks.importId, row.id), eq(historyChunks.idx, idx))));
    if (!c) throw new HistoryError("Part of the upload is missing. Upload the file again.");
    cache = { idx, data: c.data };
    return c.data;
  };
  async function* stream(offset: number, length: number) {
    for (let at = offset, end = Math.min(offset + length, row.bytes); at < end;) {
      const idx = Math.floor(at / row.chunkBytes), base = idx * row.chunkBytes;
      const piece = (await chunk(idx)).subarray(at - base, Math.min(end - base, row.chunkBytes));
      yield piece;
      at += piece.length;
    }
  }
  return {
    size: row.bytes,
    async read(offset, length) { const out: Buffer[] = []; for await (const p of stream(offset, length)) out.push(p); return Buffer.concat(out); },
    stream,
  };
}

async function setState(userId: string, id: string, values: Partial<typeof historyImports.$inferInsert>) {
  await asUser(userId, (tx) => tx.update(historyImports).set({ ...values, updatedAt: new Date() }).where(eq(historyImports.id, id)));
}

/** Read the file: keep the person's own messages, once each. Then delete the file. */
async function read(userId: string, row: Row, heartbeat: () => Promise<void>) {
  await asUser(userId, async (tx) => {
    await tx.update(historyImports).set({ status: "reading", progress: { stage: "reading", done: 0, total: row.bytes }, updatedAt: new Date() }).where(eq(historyImports.id, row.id));
    await tx.delete(historyMessages).where(eq(historyMessages.importId, row.id)); // a retry starts clean
  });
  const stats: Required<Pick<ImportStats, "conversations" | "messages" | "kept" | "duplicates" | "noise" | "skipped" | "empty" | "detected" | "notes">> = {
    conversations: 0, messages: 0, kept: 0, duplicates: 0, noise: 0, skipped: 0, empty: 0, detected: {}, notes: [],
  };
  const src = chunkSource(userId, row);
  let consumed = 0, last = 0;
  const counted: ByteSource = { ...src, async *stream(o, n) { for await (const b of src.stream(o, n)) { consumed += b.length; yield b; } } };
  const progress = async () => {
    if (Date.now() - last < 1500) return;
    last = Date.now();
    await setState(userId, row.id, { progress: { stage: "reading", done: Math.min(consumed, row.bytes), total: row.bytes }, stats });
    await heartbeat();
  };

  let files: { name: string; open: () => AsyncIterable<Buffer> }[];
  if (isZip(await src.read(0, Math.min(4, row.bytes)))) {
    const found = (await entries(src)).filter((e) => isConversationsFile(e.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!found.length) throw new HistoryError("This zip has no conversations.json. If your export came in several parts, upload part 1.");
    files = found.map((e) => ({ name: e.name, open: () => open(counted, e) }));
  } else {
    files = [{ name: row.fileName, open: () => counted.stream(0, row.bytes) }];
  }

  const seen = new Set<string>();
  let batch: (typeof historyMessages.$inferInsert)[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const kept = await asUser(userId, (tx) => tx.insert(historyMessages).values(batch).onConflictDoNothing().returning({ id: historyMessages.id }));
    stats.kept += kept.length;
    stats.duplicates += batch.length - kept.length; // already kept from an earlier import
    batch = [];
  };

  for (const f of files) {
    const report: SplitReport = { skipped: 0, truncated: false };
    for await (const top of elements(f.open(), IMPORT.maxConversationBytes, report)) {
      for (const raw of unwrap(top)) {
        const conv = readConversation(raw);
        if (!conv) { stats.skipped++; continue; }
        stats.conversations++;
        stats.detected[conv.source] = (stats.detected[conv.source] ?? 0) + 1;
        if (!conv.turns.length) stats.empty++;
        for (const t of conv.turns) {
          stats.messages++;
          const body = clean(t.text);
          if (isNoise(body)) { stats.noise++; continue; }
          const hash = hashOf(body);
          if (seen.has(hash)) { stats.duplicates++; continue; }
          seen.add(hash);
          batch.push({ userId, importId: row.id, conversation: conv.title?.slice(0, 200) || null, sentAt: t.at, body, hash });
          if (batch.length >= 500) await flush();
        }
      }
      await progress();
    }
    stats.skipped += report.skipped;
    if (report.truncated) stats.notes.push(`${f.name} stops part-way; everything before the break was read.`);
  }
  await flush();
  if (!stats.conversations) throw new HistoryError(`No conversations found in this file. Is it the export from ${SOURCE_NAME[row.source]}?`);
  const other: Source = row.source === "chatgpt" ? "claude" : "chatgpt";
  if ((stats.detected[other] ?? 0) > (stats.detected[row.source] ?? 0)) stats.notes.push(`This looks like a ${SOURCE_NAME[other]} export, so it was read as one.`);
  await asUser(userId, async (tx) => {
    await tx.update(historyImports).set({ status: "distilling", stats, progress: { stage: "distilling", done: 0, total: 1 }, updatedAt: new Date() }).where(eq(historyImports.id, row.id));
    await tx.delete(historyChunks).where(eq(historyChunks.importId, row.id)); // the uploaded file is not kept
    await trackTx(tx, userId, { feature: FEATURE, action: "read", bytes: row.bytes, meta: { source: row.source, conversations: stats.conversations, messages: stats.messages, kept: stats.kept, duplicates: stats.duplicates } });
  });
}

type Candidate = { text: string; msg: Pooled };

/** Distil the kept messages into suggestions: count terms over all of them (free), send a sample to
 *  the model in batches, merge once, and drop anything the profile or an earlier import already has. */
async function distil(userId: string, id: string, heartbeat: () => Promise<void>): Promise<string> {
  const [row] = await asUser(userId, (tx) => tx.select().from(historyImports).where(eq(historyImports.id, id)));
  if (!row) return "import deleted";
  const stats = row.stats as ImportStats;
  const notes = [...(stats.notes ?? [])];

  // One pass over everything kept, a page at a time: term counts, and bounded pools for the model and for voice.
  const counts = new Map<string, number>();
  let pool: Pooled[] = [], voices: Pooled[] = [];
  for (let after = "00000000-0000-0000-0000-000000000000"; ;) {
    const page = await asUser(userId, (tx) => tx.select({ id: historyMessages.id, body: historyMessages.body, conversation: historyMessages.conversation, sentAt: historyMessages.sentAt })
      .from(historyMessages).where(and(eq(historyMessages.importId, id), gt(historyMessages.id, after))).orderBy(asc(historyMessages.id)).limit(2000));
    if (!page.length) break;
    after = page[page.length - 1].id;
    countTerms(page.map((m) => m.body), counts);
    pool.push(...page.map((m) => ({ ...m, body: m.body.slice(0, IMPORT.excerptChars) })));
    voices.push(...page.filter((m) => voiceScore(m.body) > 0));
    if (pool.length > 4000) pool = pool.sort((a, b) => selfScore(b.body) - selfScore(a.body)).slice(0, 2000);
    if (voices.length > 200) voices = voices.sort((a, b) => voiceScore(b.body) - voiceScore(a.body)).slice(0, 100);
    await heartbeat();
  }

  const groups = batches(pick(pool, IMPORT.maxBatches * IMPORT.batchChars, IMPORT.excerptChars), IMPORT.batchChars).slice(0, IMPORT.maxBatches);
  const d = distiller();
  const facts: Candidate[] = [], never: Candidate[] = [], topics: string[] = [], ideas: string[] = [], flagged = new Set<string>();
  let costUsd = 0, readBatches = 0;
  for (const [i, g] of groups.entries()) {
    const at = (n: number) => g[n - 1] as Pooled | undefined;
    let found: Found | undefined;
    try {
      const u = await spend(userId, async () => { const r = await d.map(g.map((m, k): Excerpt => ({ n: k + 1, text: m.body }))); found = r.found; return r.usage; });
      costUsd += u.costUsd; readBatches++;
    } catch (e) {
      if (!(e instanceof CapReached)) throw e;
      notes.push(`Read ${readBatches} of ${groups.length} batches: this month's model allowance ran out.`);
      break;
    }
    // A fact or never item counts only if it points at a message the person actually wrote.
    for (const f of found!.facts) { const m = f.from.map(at).find(Boolean); if (m && f.text.trim()) facts.push({ text: f.text.trim(), msg: m }); }
    for (const f of found!.never) { const m = f.from.map(at).find(Boolean); if (m && f.text.trim()) never.push({ text: f.text.trim(), msg: m }); }
    topics.push(...found!.topics); ideas.push(...found!.ideas);
    for (const n of found!.voice) { const m = at(n); if (m) flagged.add(m.id); }
    await setState(userId, id, { progress: { stage: "distilling", done: i + 1, total: groups.length + 1 } });
    await heartbeat();
  }

  const [p] = await asUser(userId, (tx) => tx.select().from(profiles).where(eq(profiles.userId, userId)));
  const known = { facts: (p?.facts as string[]) ?? [], topics: (p?.topics as string[]) ?? [], noGo: (p?.noGo as string[]) ?? [] };
  const input = {
    facts: facts.map((f, k) => ({ n: k + 1, text: f.text })), never: never.map((f, k) => ({ n: k + 1, text: f.text })),
    topics, ideas, terms: topTerms(counts, 40), known,
  };
  let merged: Merged;
  if (!facts.length && !never.length && !topics.length && !ideas.length) merged = (await mockDistiller.reduce(input)).merged;
  else {
    try {
      let out: Merged | undefined;
      const u = await spend(userId, async () => { const r = await d.reduce(input); out = r.merged; return r.usage; });
      costUsd += u.costUsd; merged = out!;
    } catch (e) {
      if (!(e instanceof CapReached)) throw e;
      merged = (await mockDistiller.reduce(input)).merged;
      notes.push("Merged without the model: this month's allowance ran out.");
    }
  }

  // Voice: messages the model flagged first, then the most post-like.
  const voice = [...voices].sort((a, b) => Number(flagged.has(b.id)) - Number(flagged.has(a.id)) || voiceScore(b.body) - voiceScore(a.body)).slice(0, IMPORT.maxVoice);
  const cite = (from: number[], list: Candidate[]) => { const c = from.map((n) => list[n - 1]).find(Boolean); return c ? evidenceFor(c.text, c.msg.body) : null; };
  const proposed: { kind: Kind; body: string; evidence: string | null }[] = [
    ...merged.facts.slice(0, IMPORT.maxFacts).map((f) => ({ kind: "fact" as const, body: f.text.trim().slice(0, 300), evidence: cite(f.from, facts) })),
    ...merged.topics.filter((t) => t.trim().length <= 60).slice(0, IMPORT.maxTopics).map((t) => ({ kind: "topic" as const, body: t.trim(), evidence: null })),
    ...voice.map((m) => ({ kind: "voice" as const, body: m.body, evidence: m.conversation ? `From “${m.conversation}”` : null })),
    ...merged.never.slice(0, IMPORT.maxNoGo).map((f) => ({ kind: "no_go" as const, body: f.text.trim().slice(0, 100), evidence: cite(f.from, never) })),
    ...merged.ideas.slice(0, IMPORT.maxIdeas).map((t) => ({ kind: "idea" as const, body: t.trim().slice(0, 500), evidence: null })),
  ].filter((s) => s.body.length >= 2);

  const suggestions = await asUser(userId, async (tx) => {
    // Nothing the profile already has, and nothing an earlier import already suggested.
    const earlier = await tx.select({ kind: historySuggestions.kind, body: historySuggestions.body }).from(historySuggestions).where(inArray(historySuggestions.status, ["pending", "accepted"]));
    const has = new Set([...earlier.map((s) => `${s.kind}:${same(s.body)}`),
      ...known.facts.map((x) => `fact:${same(x)}`), ...known.topics.map((x) => `topic:${same(x)}`), ...known.noGo.map((x) => `no_go:${same(x)}`),
      ...((p?.voiceSamples as string[]) ?? []).map((x) => `voice:${same(x)}`)]);
    const fresh = proposed.filter((s) => { const k = `${s.kind}:${same(s.body)}`; if (has.has(k)) return false; has.add(k); return true; });
    if (fresh.length) await tx.insert(historySuggestions).values(fresh.map((s) => ({ ...s, userId, importId: id })));
    const byKind: Partial<Record<Kind, number>> = {};
    for (const s of fresh) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
    const done: ImportStats = { ...stats, notes, batches: groups.length, batchesRead: readBatches, excerpts: groups.flat().length, suggestions: byKind };
    await tx.update(historyImports).set({
      status: "ready", stats: done, costUsd: costUsd.toFixed(6), progress: { stage: "distilling", done: 1, total: 1 }, finishedAt: new Date(), updatedAt: new Date(),
    }).where(eq(historyImports.id, id));
    await trackTx(tx, userId, { feature: FEATURE, action: "distill", costUsd, meta: { batches: groups.length, read: readBatches, suggestions: fresh.length, model: d.name } });
    return fresh.length;
  });
  return `${suggestions} suggestions from ${stats.kept ?? 0} messages, $${costUsd.toFixed(4)}`;
}

/** The worker's job. A bad file is reported on the import, not retried: the file is deleted either way. */
export async function runImport(userId: string, id: string, heartbeat: () => Promise<void> = async () => {}): Promise<string> {
  const [row] = await asUser(userId, (tx) => tx.select().from(historyImports).where(eq(historyImports.id, id)));
  if (!row) return "import deleted";
  if (row.status === "ready" || row.status === "failed" || row.status === "uploading") return `skipped: ${row.status}`;
  try {
    if (row.status === "queued" || row.status === "reading") await read(userId, row, heartbeat);
    return await distil(userId, id, heartbeat);
  } catch (e) {
    const known = e instanceof HistoryError || e instanceof ZipError || e instanceof JsonStreamError;
    if (!known) console.error("[import]", e);
    const msg = known ? (e as Error).message : "Something went wrong reading this export. Try again, or upload the conversations.json from inside the zip.";
    await asUser(userId, async (tx) => {
      await tx.update(historyImports).set({ status: "failed", error: msg, finishedAt: new Date(), updatedAt: new Date() }).where(eq(historyImports.id, id));
      await tx.delete(historyChunks).where(eq(historyChunks.importId, id));
    }).catch(() => {});
    await track(userId, { feature: FEATURE, action: "failed", meta: { error: msg.slice(0, 300) } });
    return `failed: ${msg}`;
  }
}
