// Reading ChatGPT and Claude exports: one conversation object in, the person's own messages out.
// Both formats change without notice, so every field is optional here and anything unexpected is
// skipped, never fatal. Pure functions; src/services/history.ts streams the file through them.
//
// ChatGPT (conversations.json, or conversations-000.json… in large exports): an array of
//   { title, create_time (unix seconds), conversation_id | id, mapping: { [node]: { message, parent, children } } }
//   message: { author: { role }, create_time, content: { content_type, parts[] | text | user_profile }, metadata }
// Claude (conversations.json): an array of
//   { uuid, name, created_at (ISO), chat_messages: [{ sender: "human" | "assistant", text, content[], created_at }] }
import { createHash } from "node:crypto";
import { IMPORT } from "@/lib/catalog";

export type Source = "chatgpt" | "claude";
export type Turn = { text: string; at: Date | null };
export type Conversation = { id: string | null; title: string | null; source: Source; turns: Turn[] };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown) => (typeof x === "string" ? x : null);
const fromUnix = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? new Date(x * 1000) : null);
const fromIso = (x: unknown) => { const t = typeof x === "string" ? Date.parse(x) : NaN; return Number.isFinite(t) ? new Date(t) : null; };

/** Which export a conversation object came from, by its shape. */
export function detect(x: unknown): Source | null {
  if (!isObj(x)) return null;
  if (isObj(x.mapping)) return "chatgpt";
  if (Array.isArray(x.chat_messages)) return "claude";
  return null;
}

/** A file's top-level value as a list of conversations: an array, `{ conversations: [...] }`, or one conversation. */
export function unwrap(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (isObj(x) && Array.isArray(x.conversations)) return x.conversations;
  return [x];
}

function chatgptText(content: unknown): string | null {
  if (!isObj(content)) return null;
  const type = str(content.content_type) ?? "text";
  // Custom instructions: what the person wrote about themselves (not how the model should answer).
  if (type === "user_editable_context") return str(content.user_profile);
  if (type === "code" || type === "execution_output") return null;
  if (Array.isArray(content.parts)) {
    const texts = content.parts.flatMap((p) => (typeof p === "string" ? [p] : isObj(p) && typeof p.text === "string" ? [p.text] : []));
    return texts.join("\n").trim() || null;
  }
  return str(content.text);
}

export function fromChatGPT(x: unknown): Conversation | null {
  if (!isObj(x) || !isObj(x.mapping)) return null;
  const started = fromUnix(x.create_time);
  const turns: (Turn & { order: number })[] = [];
  let order = 0;
  for (const node of Object.values(x.mapping)) {
    const m = isObj(node) ? node.message : null;
    if (!isObj(m) || !isObj(m.author)) continue;
    const role = m.author.role, meta = isObj(m.metadata) ? m.metadata : {};
    let text: string | null = null;
    if (role === "user") {
      const content = m.content;
      const context = isObj(content) && content.content_type === "user_editable_context";
      if (meta.is_visually_hidden_from_conversation && !context) continue;
      text = chatgptText(content);
    } else if (role === "system" && meta.is_user_system_message && isObj(meta.user_context_message_data)) {
      text = str(meta.user_context_message_data.about_user_message);
    }
    if (text?.trim()) turns.push({ text: text.trim(), at: fromUnix(m.create_time) ?? started, order: order++ });
  }
  turns.sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity) || a.order - b.order);
  return {
    id: str(x.conversation_id) ?? str(x.id), title: str(x.title), source: "chatgpt",
    turns: turns.map(({ text, at }) => ({ text, at })),
  };
}

function claudeText(m: Obj): string | null {
  const blocks = Array.isArray(m.content) ? m.content : m.content == null ? [] : [m.content];
  const texts = blocks.flatMap((b) => (typeof b === "string" ? [b] : isObj(b) && (b.type ?? "text") === "text" && typeof b.text === "string" ? [b.text] : []));
  return texts.join("\n\n").trim() || str(m.text)?.trim() || null;
}

export function fromClaude(x: unknown): Conversation | null {
  if (!isObj(x) || !Array.isArray(x.chat_messages)) return null;
  const started = fromIso(x.created_at);
  const turns: Turn[] = [];
  for (const m of x.chat_messages) {
    if (!isObj(m) || (m.sender !== "human" && m.sender !== "user")) continue;
    const text = claudeText(m);
    if (text) turns.push({ text, at: fromIso(m.created_at) ?? started });
  }
  return { id: str(x.uuid) ?? str(x.id), title: str(x.name) ?? str(x.title), source: "claude", turns };
}

/** Either format, by shape. */
export function readConversation(x: unknown): Conversation | null {
  const s = detect(x);
  return s === "chatgpt" ? fromChatGPT(x) : s === "claude" ? fromClaude(x) : null;
}

/** Which zip entries hold conversations: conversations.json, conversations-000.json…, conversations/<id>.json. */
export const isConversationsFile = (name: string) =>
  !name.startsWith("__MACOSX/") && /(^|\/)(conversations(-\d+)?\.json|conversations\/[^/]+\.json)$/i.test(name);

// ---------------------------------------------------------------------------------------------
// What to keep, and what the model reads.

const FENCE = /```[\s\S]*?(```|$)/g;

/** The message as kept: code blocks dropped, whitespace tidied, capped. */
export function clean(text: string): string {
  return text.replace(FENCE, " ").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, IMPORT.messageChars);
}

/** Two messages are the same if they match after case and whitespace are ignored. */
export const hashOf = (text: string) => createHash("sha256").update(text.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");

const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
const symbolRatio = (s: string) => (s.match(/[{}[\]();=<>$\\|`]/g) ?? []).length / Math.max(s.length, 1);

/** Too short, mostly code, a bare link or not words at all: not worth keeping. */
export function isNoise(text: string): boolean {
  if (text.length < 12) return true;
  if (/^\s*https?:\/\/\S+\s*$/.test(text)) return true;
  if (letters(text) / text.length < 0.5) return true;
  return symbolRatio(text) > 0.08;
}

const SELF = /\b(i am|i'm|i work|i've|i have|i run|i lead|i led|i founded|i started|i manage|i built|i help|my (company|team|firm|startup|clients?|role|job|background|business|career|experience)|we (build|sell|run|help|make))\b/gi;
const PROMPT = /^(please |can you|could you|write|rewrite|generate|create|make|fix|explain|summari[sz]e|translate|give me|help me|draft|list|what|how|why|is |are |do |does )/i;

/** How much a message says about the person: first-person statements, in prose. */
export function selfScore(text: string): number {
  const hits = (text.match(SELF) ?? []).length;
  const prose = /[.!?]\s/.test(text) ? 1 : 0;
  return hits * 3 + prose + Math.min(text.length, 1200) / 1200;
}

/** Reads like something the person would publish: a few paragraphs of first-person prose, not a request. */
export function voiceScore(text: string): number {
  if (text.length < 280 || text.length > 1500 || PROMPT.test(text.trim()) || symbolRatio(text) > 0.02 || /\?\s*$/.test(text.trim())) return 0;
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 3).length;
  if (sentences < 3) return 0;
  return 1 + (text.match(/\b(i|my|we|our)\b/gi) ?? []).length / 10 + (text.includes("\n\n") ? 1 : 0);
}

export type Pooled = { id: string; body: string; conversation: string | null; sentAt: Date | null };

/** What the model reads: the most self-revealing messages, spread across conversations, newest first
 *  on ties, each cut to `excerpt` characters, until `budget` characters. */
export function pick(pool: Pooled[], budget: number, excerpt: number): Pooled[] {
  const byConv = new Map<string, Pooled[]>();
  const ranked = [...pool].sort((a, b) => selfScore(b.body) - selfScore(a.body) || (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));
  for (const m of ranked) {
    const k = m.conversation ?? "";
    if (!byConv.has(k)) byConv.set(k, []);
    byConv.get(k)!.push(m);
  }
  const queues = [...byConv.values()];
  const out: Pooled[] = [];
  let used = 0;
  for (let round = 0; used < budget && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      const m = q[round];
      if (!m) continue;
      const body = m.body.slice(0, excerpt);
      if (used + body.length > budget) return out;
      out.push({ ...m, body }); used += body.length;
    }
  }
  return out;
}

/** Split into batches of at most `chars` characters each. */
export function batches<T extends { body: string }>(items: T[], chars: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [], n = 0;
  for (const it of items) {
    if (cur.length && n + it.body.length > chars) { out.push(cur); cur = []; n = 0; }
    cur.push(it); n += it.body.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

const STOP = new Set(("about above after again against all also always am an and any are aren as at be because been before being below between both but by can cannot " +
  "could did didn do does doing don down during each even every few for from further get gets getting give go going good got had has have having he her here hers " +
  "herself him himself his how i if in into is isn it its itself just know let like make many me might more most much must my myself need new no nor not now of " +
  "off on once one only or other ought our ours ourselves out over own please really right same say see she should so some something still such sure take than " +
  "thank thanks that the their theirs them themselves then there these they thing things think this those through to too try under until up us use used using " +
  "very want was way we well were what when where which while who whom why will with without would write yes yet you your yours yourself yourselves " +
  "able another anything back best better day each first great help hey hi last long look lot maybe okay ok people since time today week work year years")
  .split(" "));

const words = (s: string) => s.toLowerCase().match(/\p{L}[\p{L}'-]{2,}/gu)?.filter((w) => !STOP.has(w)) ?? [];

/** Counts terms and two-word phrases across messages (one count per message), for topic hints.
 *  Pass `counts` to keep counting across pages; it is pruned so it stays small. */
export function countTerms(texts: string[], counts = new Map<string, number>(), keep = 5000): Map<string, number> {
  for (const t of texts) {
    const w = words(t.replace(FENCE, " "));
    const seen = new Set<string>();
    for (let i = 0; i < w.length; i++) {
      seen.add(w[i]);
      if (i + 1 < w.length) seen.add(`${w[i]} ${w[i + 1]}`);
    }
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size > keep * 2) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, keep);
    counts.clear();
    for (const [k, v] of top) counts.set(k, v);
  }
  return counts;
}

/** The most frequent terms, preferring phrases over the single words inside them. */
export function topTerms(counts: Map<string, number>, n: number, min = 2): string[] {
  const sorted = [...counts.entries()].filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length);
  const out: string[] = [];
  for (const [k, v] of sorted) {
    if (out.length >= n) break;
    // A phrase that occurs nearly as often as its words replaces them.
    if (!k.includes(" ") && sorted.some(([p, pv]) => p.includes(" ") && p.split(" ").includes(k) && pv >= v * 0.6)) continue;
    if (out.some((o) => o.split(" ").includes(k))) continue;
    out.push(k);
  }
  return out;
}

/** Compare suggestions and profile items without case, punctuation or extra spaces. */
export const same = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The sentence in `body` that shares the most words with `claim`, as evidence (at most 200 characters). */
export function evidenceFor(claim: string, body: string): string {
  const want = new Set(words(claim));
  const sentences = body.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  let best = sentences[0] ?? body, score = -1;
  for (const s of sentences) {
    const n = words(s).filter((w) => want.has(w)).length;
    if (n > score) { best = s; score = n; }
  }
  return best.length > 200 ? `${best.slice(0, 197)}…` : best;
}
