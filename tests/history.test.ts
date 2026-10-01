// AI history import: both export parsers on invented fixtures (and on malformed input), the streaming
// zip and JSON readers, what's kept and what the model reads, and (against a real Postgres) the whole
// upload -> read -> distil -> accept path, per user.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { bufferSource, entries, isZip, open, ZipError } from "@/lib/zip";
import { elements, JsonStreamError, type SplitReport } from "@/lib/json-stream";
import {
  batches, clean, countTerms, detect, evidenceFor, fromChatGPT, fromClaude, hashOf, isConversationsFile, isNoise, pick, readConversation, topTerms, unwrap, voiceScore,
} from "@/lib/history";
import { mockDistiller } from "@/lib/history-distill";
import { SAMPLE_CHATGPT, SAMPLE_CLAUDE } from "@/lib/history-samples";
import { makeZip } from "./fixtures/zip";

async function* pieces(buf: Buffer, size: number) { for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size); }
async function all<T>(it: AsyncIterable<T>) { const out: T[] = []; for await (const x of it) out.push(x); return out; }
const json = (x: unknown) => Buffer.from(JSON.stringify(x));

describe("ChatGPT export", () => {
  const [c1, c2, c3, bad] = SAMPLE_CHATGPT;

  it("keeps only what the person wrote, in order, including their custom instructions", () => {
    const a = fromChatGPT(c1)!;
    expect(a).toMatchObject({ id: "demo-c1", title: "Seed model structure", source: "chatgpt" });
    expect(a.turns.map((x) => x.text)).toEqual([
      expect.stringMatching(/^I'm a fractional CFO/),
      expect.stringMatching(/^I run finance/),
      expect.stringMatching(/^I've been a CPA/),
    ]);
    expect(a.turns[1].at?.toISOString()).toBe("2026-06-02T14:01:00.000Z");
  });

  it("reads the about-you system message, keeps the text beside an image, and drops code and assistant replies", () => {
    const texts = fromChatGPT(c2)!.turns.map((x) => x.text);
    expect(texts[0]).toMatch(/^I'm a fractional CFO/);
    expect(texts).toContain("Here's the cash runway chart from the board deck for climate-tech startups; does the scale read clearly?");
    expect(texts.join(" ")).not.toMatch(/read_csv|strong angle/);
    expect(fromChatGPT(c3)!.turns).toHaveLength(3);
  });

  it("survives a conversation with broken nodes and a bad timestamp", () => {
    expect(fromChatGPT(bad)).toMatchObject({ title: "Malformed on purpose", turns: [] });
    expect(fromChatGPT({ mapping: { a: { message: { author: { role: "user" }, content: { parts: [null, 7, { text: 3 }] } } } } })!.turns).toEqual([]);
    expect(fromChatGPT({ mapping: { a: { message: { author: { role: "user" }, content: { content_type: "text", text: "Plain text field instead of parts." } } } } })!.turns[0].text).toBe("Plain text field instead of parts.");
    expect(fromChatGPT("nope")).toBeNull();
    expect(fromChatGPT({ mapping: [] })).toBeNull();
  });
});

describe("Claude export", () => {
  const [k1, k2, junk] = SAMPLE_CLAUDE;

  it("reads content blocks first, falls back to text, and skips the assistant and attachments", () => {
    const a = fromClaude(k1)!;
    expect(a).toMatchObject({ id: "demo-k1", title: "Grid interconnection queues", source: "claude" });
    expect(a.turns.map((x) => x.text)).toEqual([expect.stringMatching(/^I help climate-tech startups/), expect.stringMatching(/^I'm thinking about writing a post/)]);
    expect(JSON.stringify(a)).not.toMatch(/queue_date|Interconnection delays/);
    expect(a.turns[0].at?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
  });

  it("accepts content as a plain string, skips thinking blocks and tool calls", () => {
    expect(fromClaude(k2)!.turns.map((x) => x.text)).toEqual([
      expect.stringMatching(/^I helped raise a \$6M seed round/), "Never write about my kids. Keep family out of anything public.", expect.stringMatching(/^I've been a CPA/),
    ]);
  });

  it("survives malformed messages", () => {
    expect(fromClaude(junk)).toBeNull();
    expect(fromClaude({ chat_messages: [null, 3, { sender: "human" }, { sender: "human", content: { type: "text", text: "One object, not a list." }, created_at: "garbage" }] })!.turns)
      .toEqual([{ text: "One object, not a list.", at: null }]);
  });
});

describe("telling the formats apart", () => {
  it("detects by shape and unwraps the containers exports come in", () => {
    expect(detect(SAMPLE_CHATGPT[0])).toBe("chatgpt");
    expect(detect(SAMPLE_CLAUDE[0])).toBe("claude");
    expect(detect({ title: "x" })).toBeNull();
    expect(readConversation(SAMPLE_CLAUDE[0])?.source).toBe("claude");
    expect(unwrap([1, 2])).toEqual([1, 2]);
    expect(unwrap({ conversations: [1] })).toEqual([1]);
    expect(unwrap({ uuid: "one" })).toEqual([{ uuid: "one" }]);
  });

  it("finds the conversations files in a zip, including split and per-conversation layouts", () => {
    for (const n of ["conversations.json", "Export/conversations.json", "conversations-000.json", "conversations-012.json", "conversations/abc.json"]) expect(isConversationsFile(n), n).toBe(true);
    for (const n of ["users.json", "chat.html", "projects.json", "__MACOSX/conversations.json", "file-abc.png", "conversation_asset_file_names.json"]) expect(isConversationsFile(n), n).toBe(false);
  });
});

describe("streaming JSON", () => {
  it("yields each element of a top-level array, however the bytes are split", async () => {
    const doc = Buffer.from(`﻿ [ {"a": "x]}\\"{["}, [1,2], 7, "str,]", {"b": {"c": [{}]}} ]`);
    for (const size of [1, 2, 3, 7, 1000]) {
      const report: SplitReport = { skipped: 0, truncated: false };
      expect(await all(elements(pieces(doc, size), 1e6, report)), `size ${size}`).toEqual([{ a: 'x]}"{[' }, [1, 2], { b: { c: [{}] } }]);
      expect(report).toEqual({ skipped: 2, truncated: false });
    }
  });

  it("parses the real samples the same as JSON.parse", async () => {
    for (const s of [SAMPLE_CHATGPT, SAMPLE_CLAUDE]) expect(await all(elements(pieces(json(s), 13), 1e6))).toEqual(JSON.parse(JSON.stringify(s)).filter((x: unknown) => typeof x === "object"));
  });

  it("yields a top-level object whole, and skips an element that won't parse", async () => {
    expect(await all(elements(pieces(json({ conversations: [{ uuid: "1" }] }), 5), 1e6))).toEqual([{ conversations: [{ uuid: "1" }] }]);
    const report: SplitReport = { skipped: 0, truncated: false };
    expect(await all(elements(pieces(Buffer.from(`[{"a":1}, {"b": nope}, {"c":3}]`), 4), 1e6, report))).toEqual([{ a: 1 }, { c: 3 }]);
    expect(report.skipped).toBe(1);
  });

  it("keeps what was complete when a file stops part-way, and refuses what isn't a conversations file", async () => {
    const report: SplitReport = { skipped: 0, truncated: false };
    expect(await all(elements(pieces(Buffer.from(`[{"a":1},{"b":`), 3), 1e6, report))).toEqual([{ a: 1 }]);
    expect(report.truncated).toBe(true);
    await expect(all(elements(pieces(Buffer.from(`[{"b":`), 3), 1e6))).rejects.toThrow(/stops part-way/);
    await expect(all(elements(pieces(Buffer.from("<html>"), 3), 1e6))).rejects.toThrow(JsonStreamError);
    await expect(all(elements(pieces(Buffer.from("  "), 3), 1e6))).rejects.toThrow(/empty/);
    await expect(all(elements(pieces(Buffer.from(`[{"a":"${"x".repeat(100)}"}]`), 10), 50))).rejects.toThrow(/over/);
  });
});

describe("zip", () => {
  const conv = JSON.stringify(SAMPLE_CHATGPT);

  for (const [label, opts, method] of [["deflated", {}, 8], ["stored", {}, 0], ["zip64", { zip64: true }, 8], ["data descriptors", { descriptor: true }, 8]] as const) {
    it(`reads ${label} entries as a stream`, async () => {
      const zip = makeZip([{ name: "chat.html", data: "<html></html>" }, { name: "conversations.json", data: conv, method }, { name: "user.json", data: "{}" }], opts);
      expect(isZip(zip)).toBe(true);
      const src = bufferSource(zip, 7); // tiny pieces: every boundary case
      const list = await entries(src);
      expect(list.map((e) => e.name)).toEqual(["chat.html", "conversations.json", "user.json"]);
      const out = Buffer.concat(await all(open(src, list.find((e) => isConversationsFile(e.name))!)));
      expect(out.toString()).toBe(conv);
    });
  }

  it("refuses damaged, cut-off, encrypted or non-zip files with a reason a person can act on", async () => {
    const zip = makeZip([{ name: "conversations.json", data: conv }]);
    await expect(entries(bufferSource(zip.subarray(0, zip.length - 30)))).rejects.toThrow(ZipError);
    await expect(entries(bufferSource(Buffer.from("PK\u0003\u0004 not really a zip")))).rejects.toThrow(/complete zip/);
    const locked = makeZip([{ name: "conversations.json", data: conv }], { encrypted: "conversations.json" });
    const [e] = await entries(bufferSource(locked));
    await expect(all(open(bufferSource(locked), e))).rejects.toThrow(/encrypted/);
    const corrupt = Buffer.from(zip); corrupt.fill(0xff, 40, 80);
    const [c] = await entries(bufferSource(corrupt));
    await expect(all(open(bufferSource(corrupt), c))).rejects.toThrow(ZipError);
    expect(isZip(Buffer.from("[{}]"))).toBe(false);
  });
});

describe("what's kept and what the model reads", () => {
  it("drops code blocks, caps length, and dedupes by meaning-free differences", () => {
    expect(clean("Here's my plan.\n```js\nconst x = 1;\n```\nThoughts?")).toBe("Here's my plan.\n\nThoughts?");
    expect(clean("x".repeat(9000))).toHaveLength(4000);
    expect(hashOf("Hello   World")).toBe(hashOf(" hello world "));
    expect(hashOf("hello world")).not.toBe(hashOf("hello, world"));
  });

  it("treats short replies, bare links and code as noise", () => {
    for (const n of ["thanks!", "continue", "https://example.com/a/b", "{ \"a\": [1, 2, 3], \"b\": { \"c\": null } }", "1234 5678 9012 3456 7890"]) expect(isNoise(n), n).toBe(true);
    expect(isNoise("I run finance for a heat-pump installer.")).toBe(false);
  });

  it("knows a post from a prompt", () => {
    const post = (fromChatGPT(SAMPLE_CHATGPT[2])!.turns[0]).text;
    expect(voiceScore(post)).toBeGreaterThan(0);
    expect(voiceScore(`Write me a post about cash. ${post}`)).toBe(0);
    expect(voiceScore("Short. Too short.")).toBe(0);
  });

  it("samples the most self-revealing messages across conversations, within the budget", () => {
    const pool = [
      { id: "1", body: "I run a consultancy and I lead a team of four. ".repeat(4), conversation: "a", sentAt: null },
      { id: "2", body: "I'm a CPA. My clients are startups. ".repeat(4), conversation: "a", sentAt: null },
      { id: "3", body: "What is a tax lot?", conversation: "b", sentAt: null },
      { id: "4", body: "Explain depreciation please.", conversation: "c", sentAt: null },
    ];
    const chosen = pick(pool, 1000, 50);
    expect(chosen.map((m) => m.id).slice(0, 3).sort()).toEqual(["1", "3", "4"]); // one per conversation first
    expect(chosen.every((m) => m.body.length <= 50)).toBe(true);
    expect(pick(pool, 60, 50)).toHaveLength(1);
    expect(batches([{ body: "aaaa" }, { body: "bbbb" }, { body: "cc" }], 6).map((b) => b.length)).toEqual([1, 2]);
  });

  it("counts recurring phrases for topic hints and cites the sentence a claim came from", () => {
    const texts = [...SAMPLE_CHATGPT, ...SAMPLE_CLAUDE].flatMap((c) => readConversation(c)?.turns.map((x) => x.text) ?? []);
    const top = topTerms(countTerms(texts), 10);
    expect(top).toContain("climate-tech startups");
    expect(top).not.toContain("the");
    expect(evidenceFor("CPA since 2015", "Some context. I've been a CPA since 2015, so skip it. Other things.")).toBe("I've been a CPA since 2015, so skip it.");
  });

  it("the demo distiller finds facts, never items and ideas from the person's own sentences", async () => {
    const texts = [...SAMPLE_CHATGPT, ...SAMPLE_CLAUDE].flatMap((c) => readConversation(c)?.turns.map((x) => x.text) ?? []);
    const { found } = await mockDistiller.map(texts.map((text, i) => ({ n: i + 1, text })));
    expect(found.facts.map((f) => f.text)).toEqual(expect.arrayContaining(["I'm a fractional CFO for three climate-tech startups", "I've been a CPA since 2015, so skip the accounting basics"]));
    expect(found.never.map((f) => f.text)).toEqual(expect.arrayContaining(["Contoso", "my kids"]));
    expect(found.ideas).toEqual(expect.arrayContaining(["A post about modelling subsidies by timing, not amount"]));
    expect(found.voice.length).toBeGreaterThan(0);
    const { merged } = await mockDistiller.reduce({ facts: found.facts.map((f, i) => ({ n: i + 1, text: f.text })), never: [], topics: [], ideas: [], terms: ["climate-tech startups", "cash"], known: { facts: ["I'm a fractional CFO for three climate-tech startups"], topics: [], noGo: [] } });
    expect(merged.facts.map((f) => f.text)).not.toContain("I'm a fractional CFO for three climate-tech startups");
    expect(merged.topics).toEqual(["climate-tech startups"]);
  });
});

// ---------------------------------------------------------------------------------------------

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("importing, per user", () => {
  let mod: typeof import("@/db"), s: typeof import("@/db/schema"), svc: typeof import("@/services/history");
  const A = `hi-a-${Date.now()}`, B = `hi-b-${Date.now()}`;

  /** Upload a whole file the way the browser does, in chunks, out of order and with one repeat. */
  async function upload(user: string, source: "chatgpt" | "claude", name: string, file: Buffer, chunk = 1000) {
    const { import: imp, received } = await svc.startUpload(user, { source, name, size: file.length }, chunk);
    expect(received).toEqual([]);
    const order = [...Array(imp.chunks).keys()].reverse();
    for (const i of [...order, order[0]]) await svc.putChunk(user, imp.id, i, file.subarray(i * chunk, (i + 1) * chunk));
    return svc.finishUpload(user, imp.id);
  }

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url });
    delete process.env.ANTHROPIC_API_KEY; // the demo distiller: deterministic and free
    mod = await import("@/db"); s = await import("@/db/schema"); svc = await import("@/services/history");
    for (const id of [A, B]) {
      await mod.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false });
      await mod.asUser(id, (tx) => tx.insert(s.profiles).values({ userId: id, facts: ["Based in Denver"] }));
    }
  });
  afterAll(async () => { await mod.db.delete(s.user).where(sql`${s.user.id} in (${A}, ${B})`); });

  it("a ChatGPT zip is read in chunks, the file deleted, and suggestions made only for its owner", async () => {
    const zip = makeZip([{ name: "chat.html", data: "<html></html>" }, { name: "conversations.json", data: JSON.stringify(SAMPLE_CHATGPT) }]);
    const imp = await upload(A, "chatgpt", "export.zip", zip);
    expect(imp.status).toBe("queued");
    expect(await svc.runImport(A, imp.id)).toMatch(/suggestions/);
    const done = await svc.getImport(A, imp.id);
    expect(done).toMatchObject({ status: "ready", costUsd: 0, error: null });
    expect(done.stats).toMatchObject({ conversations: 4, detected: { chatgpt: 4 } });
    expect(done.stats.duplicates).toBeGreaterThanOrEqual(1); // the custom instructions, in two conversations
    expect(done.stats.noise).toBeGreaterThanOrEqual(1); // "thanks!"
    expect(await mod.db.select().from(s.historyChunks).where(eq(s.historyChunks.importId, imp.id))).toEqual([]);

    const o = await svc.overview(A);
    const kinds = new Set(o.suggestions.map((x) => x.kind));
    for (const k of ["fact", "topic", "voice", "no_go", "idea"]) expect(kinds, k).toContain(k);
    expect(o.suggestions.map((x) => x.body)).not.toContain("Based in Denver"); // already in the profile
    const fact = o.suggestions.find((x) => x.kind === "fact" && /fractional CFO/.test(x.body))!;
    expect(fact.evidence).toMatch(/fractional CFO/);

    // Nobody else sees any of it, or can act on it.
    expect(await svc.overview(B)).toEqual({ imports: [], suggestions: [], messages: 0 });
    await expect(svc.decide(B, fact.id, "accept")).rejects.toThrow(/gone/);
    await expect(svc.getImport(B, imp.id)).rejects.toThrow(/gone/);
    await expect(svc.putChunk(B, imp.id, 0, Buffer.from("x"))).rejects.toThrow(/gone/);
  });

  it("accepting adds to the profile; dismissing doesn't; nothing is applied without a decision", async () => {
    const before = await mod.asUser(A, (tx) => tx.select().from(s.profiles).where(eq(s.profiles.userId, A)));
    expect(before[0].facts).toEqual(["Based in Denver"]);
    const { suggestions } = await svc.overview(A);
    const fact = suggestions.find((x) => x.kind === "fact")!, voice = suggestions.find((x) => x.kind === "voice")!, never = suggestions.find((x) => x.kind === "no_go")!;
    expect(await svc.decide(A, fact.id, "accept")).toBe("Added to your facts.");
    expect(await svc.decide(A, voice.id, "accept")).toBe("Added to your sample posts.");
    expect(await svc.decide(A, never.id, "dismiss")).toBe("Dismissed.");
    await expect(svc.decide(A, fact.id, "accept")).rejects.toThrow(/already decided/);
    const [p] = await mod.asUser(A, (tx) => tx.select().from(s.profiles).where(eq(s.profiles.userId, A)));
    expect(p.facts).toEqual(["Based in Denver", fact.body]);
    expect(p.voiceSamples).toEqual([voice.body]);
    expect(p.noGo).toEqual([]);
  });

  it("a Claude export on top: overlapping messages are kept once, and nothing is suggested twice", async () => {
    const imp = await upload(A, "claude", "conversations.json", json(SAMPLE_CLAUDE), 97);
    await svc.runImport(A, imp.id);
    const done = await svc.getImport(A, imp.id);
    expect(done).toMatchObject({ status: "ready", stats: { conversations: 2, detected: { claude: 2 } } });
    expect(done.stats.duplicates).toBeGreaterThanOrEqual(1); // the CPA line, already kept from ChatGPT
    const bodies = (await svc.overview(A)).suggestions.map((x) => `${x.kind}:${x.body.toLowerCase()}`);
    expect(new Set(bodies).size).toBe(bodies.length);
    expect(bodies).toContain("no_go:my kids");
  });

  it("an idea becomes this week's check-in on request", async () => {
    const idea = (await svc.overview(A)).suggestions.find((x) => x.kind === "idea")!;
    const { id } = await svc.draftIdea(A, idea.id);
    const [input] = await mod.asUser(A, (tx) => tx.select().from(s.inputs).where(eq(s.inputs.id, id)));
    expect(input.body).toContain(idea.body);
    expect((await svc.overview(A)).suggestions.find((x) => x.id === idea.id)?.status).toBe("accepted");
  });

  it("refuses what isn't an export, a file over the cap, and finishing before every chunk is in", async () => {
    await expect(svc.startUpload(A, { source: "chatgpt", name: "notes.pdf", size: 10 })).rejects.toThrow(/\.zip/);
    await expect(svc.startUpload(A, { source: "chatgpt", name: "big.zip", size: 2 * 1024 ** 3 })).rejects.toThrow(/1 GB/);
    await expect(svc.startUpload(A, { source: "gemini", name: "x.zip", size: 10 })).rejects.toThrow(/ChatGPT or Claude/);
    const { import: imp } = await svc.startUpload(A, { source: "chatgpt", name: "fake.zip", size: 2000 }, 1000);
    await expect(svc.finishUpload(A, imp.id)).rejects.toThrow(/2 parts/);
    await expect(svc.putChunk(A, imp.id, 1, Buffer.alloc(999))).rejects.toThrow(/incomplete/);
    // Resuming the same file reports what already arrived.
    await svc.putChunk(A, imp.id, 1, Buffer.alloc(1000));
    expect((await svc.startUpload(A, { source: "chatgpt", name: "fake.zip", size: 2000 }, 1000)).received).toEqual([1]);
    await expect(svc.putChunk(A, imp.id, 0, Buffer.alloc(1000, 0x41))).rejects.toThrow(/isn't a ChatGPT or Claude export/);
    await expect(svc.getImport(A, imp.id)).rejects.toThrow(/gone/);
  });

  it("a damaged file fails with a reason, and its upload is deleted", async () => {
    const noConversations = makeZip([{ name: "user.json", data: "{}" }]);
    const a = await upload(A, "chatgpt", "part-0002.zip", noConversations);
    expect(await svc.runImport(A, a.id)).toMatch(/no conversations\.json.*part 1/);
    const notConversations = await upload(A, "claude", "conversations.json", json([{ hello: "world" }]));
    await svc.runImport(A, notConversations.id);
    expect(await svc.getImport(A, notConversations.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/No conversations found/) });
    expect(await mod.db.select().from(s.historyChunks).where(sql`${s.historyChunks.importId} in (${a.id}, ${notConversations.id})`)).toEqual([]);
  });

  it("deleting imported data removes files, messages and suggestions, and keeps what was accepted", async () => {
    expect(await svc.deleteAll(A)).toBeGreaterThanOrEqual(2);
    expect(await svc.overview(A)).toEqual({ imports: [], suggestions: [], messages: 0 });
    for (const t of [s.historyMessages, s.historySuggestions, s.historyChunks]) expect(await mod.db.select().from(t).where(eq(t.userId, A))).toEqual([]);
    const [p] = await mod.asUser(A, (tx) => tx.select().from(s.profiles).where(eq(s.profiles.userId, A)));
    expect((p.facts as string[]).length).toBe(2);
    const actions = new Set((await mod.asUser(A, (tx) => tx.select().from(s.usageEvents).where(eq(s.usageEvents.feature, "import")))).map((r) => r.action));
    for (const a of ["upload_start", "upload_done", "read", "distill", "accept_fact", "dismiss_no_go", "draft_idea", "failed", "delete"]) expect(actions, a).toContain(a);
  });
});
