// Examples: the URL guard, link previews, file sniffing, flags, what ratings teach, and (against a real
// Postgres) that examples, their files and usage events stay with their owner.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { checkUrl, FetchRefused, isPrivateAddress } from "@/lib/fetch-safe";
import { mediaKindOf, parsePreview, sniff } from "@/lib/link-preview";
import { guidanceFrom, guidanceText } from "@/lib/example-guidance";
import { mockAnalyst, type AnalysisT } from "@/lib/example-analysis";

// A 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

describe("fetching a pasted URL", () => {
  it("knows which addresses aren't on the public internet", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "13.107.42.14", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses non-web schemes, odd ports, credentials and local names before any request", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/x", "http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data",
      "https://example.com:8443/", "https://user:pw@example.com/", "http://intranet/", "http://db.internal/", "http://printer.local/", "not a url"]) {
      expect(() => checkUrl(u), u).toThrow(FetchRefused);
    }
    expect(checkUrl("https://www.linkedin.com/posts/abc").hostname).toBe("www.linkedin.com");
    expect(checkUrl("http://example.com:80/x").pathname).toBe("/x");
  });
});

describe("link previews", () => {
  const html = `<html><head>
    <title>ignored</title>
    <meta property="og:title" content="Jane Doe on LinkedIn: 12 layers of an AI system &amp; how they fit">
    <meta property="og:description" content="Most teams build layer 7 first.&#10;Here&#39;s the order that works:">
    <meta property="og:image" content="/media/flow.gif">
    <meta name="twitter:player:stream" content="https://cdn.example.com/v.mp4">
  </head></html>`;

  it("reads title, author, text and media from Open Graph tags, resolving relative links", () => {
    const p = parsePreview(html, "https://www.linkedin.com/posts/jane_123");
    expect(p.title).toBe("Jane Doe on LinkedIn: 12 layers of an AI system & how they fit");
    expect(p.author).toBe("Jane Doe");
    expect(p.body).toBe("Most teams build layer 7 first.\nHere's the order that works:");
    expect(p.image).toBe("https://www.linkedin.com/media/flow.gif");
    expect(p.video).toBe("https://cdn.example.com/v.mp4");
  });

  it("falls back to <title> and drops non-web media links", () => {
    const p = parsePreview(`<title>Plain page</title><meta property="og:image" content="javascript:alert(1)">`, "https://example.com/");
    expect(p).toMatchObject({ title: "Plain page", author: null, body: null, image: null });
  });
});

describe("uploaded files", () => {
  it("is typed by its bytes, not its name", () => {
    expect(sniff(PNG)).toBe("image/png");
    expect(sniff(Buffer.from("GIF89a....."))).toBe("image/gif");
    expect(sniff(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniff(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"))).toBeNull();
    expect(sniff(Buffer.from("<html>"))).toBeNull();
    expect(mediaKindOf("image/gif")).toBe("gif");
    expect(mediaKindOf("video/quicktime")).toBe("video");
  });
});

describe("what ratings teach", () => {
  const a = (over: Partial<AnalysisT>): AnalysisT => ({
    format: "text", hook: { type: "number", firstLine: "" }, structure: "list", length: "medium", tone: "direct", visual: null,
    cta: { type: "none", engagementBait: false }, strengths: [], weaknesses: [], transferable: "", summary: "", ...over,
  });

  it("copies techniques from liked examples and avoids patterns from disliked ones", () => {
    const g = guidanceFrom([
      { rating: "up", analysis: a({ transferable: "Promise a full list, then deliver every item the same way.", strengths: ["Skimmable"], visual: { kind: "infographic", layout: "flow", motion: "connectors animate in order", notes: "" } }) },
      { rating: "up", analysis: a({ transferable: "Promise a full list, then deliver every item the same way.", strengths: ["skimmable"] }) },
      { rating: "down", analysis: a({ transferable: "Trade the resource for a comment.", weaknesses: ["Vague claims"], cta: { type: "DM keyword", engagementBait: true } }) },
      { rating: null, analysis: a({ transferable: "unrated: ignored" }) },
    ]);
    expect(g.up).toBe(2);
    expect(g.down).toBe(1);
    expect(g.liked).toEqual(["Promise a full list, then deliver every item the same way.", "Skimmable", "Visual: infographic, connectors animate in order"]);
    expect(g.avoid).toContain("Closing on an engagement-bait trade (comment or DM a keyword)");
    expect(g.avoid).toContain("Vague claims");
    expect(JSON.stringify(g)).not.toContain("unrated");
    const text = guidanceText(g)!;
    expect(text).toMatch(/rated good/);
    expect(text).toMatch(/rated bad \(avoid\)/);
  });

  it("says nothing until something is rated", () => {
    expect(guidanceText(guidanceFrom([]))).toBeNull();
  });

  it("the demo analyst spots a list and a keyword-for-DM close", async () => {
    const { analysis } = await mockAnalyst.analyze({ url: null, title: "x", author: null, note: null, mediaKind: "gif", image: null,
      body: "12 layers you need.\n1. Data\n2. Models\nComment \"STACK\" and I'll DM you the guide." }, "claude-sonnet-5");
    expect(analysis.structure).toBe("numbered list");
    expect(analysis.format).toBe("animation");
    expect(analysis.cta.engagementBait).toBe(true);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("examples are per user", () => {
  let mod: typeof import("@/db"), s: typeof import("@/db/schema"), svc: typeof import("@/services/examples"), flags: typeof import("@/lib/flags");
  const A = `ex-a-${Date.now()}`, B = `ex-b-${Date.now()}`;

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url });
    mod = await import("@/db"); s = await import("@/db/schema");
    svc = await import("@/services/examples"); flags = await import("@/lib/flags");
    for (const id of [A, B]) {
      await mod.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false });
      await mod.asUser(id, (tx) => tx.insert(s.profiles).values({ userId: id }));
    }
  });
  afterAll(async () => { await mod.db.delete(s.user).where(sql`${s.user.id} in (${A}, ${B})`); });

  it("an upload is stored, analysed, rated and teaches only its owner", async () => {
    const e = await svc.addUpload(A, PNG, { name: "flow.png", body: "1. Data\n2. Models\n3. Agents", rating: "up" });
    expect(e).toMatchObject({ source: "upload", mediaKind: "image", mediaBytes: PNG.length, rating: "up", analysisStatus: "pending" });
    expect(await svc.runAnalysis(A, e.id)).toBeTruthy();
    const [mine] = await svc.list(A);
    expect(mine.analysisStatus).toBe("done");
    expect((await svc.guidance(A)).up).toBe(1);
    expect((await svc.guidance(B)).up).toBe(0);
    expect(await svc.list(B)).toEqual([]);
    expect(await svc.getMedia(B, e.id)).toBeNull();
    expect((await svc.getMedia(A, e.id))?.data.equals(PNG)).toBe(true);
    await expect(svc.rate(B, e.id, "down")).rejects.toThrow(/gone/);
    await expect(svc.remove(B, e.id)).rejects.toThrow(/gone/);
    const actions = (await mod.asUser(A, (tx) => tx.select().from(s.usageEvents))).map((r) => r.action).sort();
    expect(actions).toEqual(["add_upload", "analyze", "rate_up"]);
    expect(await mod.asUser(B, (tx) => tx.select().from(s.usageEvents))).toEqual([]);
  });

  it("refuses files that aren't a supported type or are over the cap", async () => {
    await expect(svc.addUpload(A, Buffer.from("<svg/>"))).rejects.toThrow(/isn't supported/);
    await expect(svc.addUpload(A, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))).rejects.toThrow(/5 MB/);
  });

  it("deleting an example deletes its file", async () => {
    const e = await svc.addUpload(A, PNG);
    await svc.remove(A, e.id);
    expect(await mod.db.select().from(s.exampleMedia).where(eq(s.exampleMedia.exampleId, e.id))).toEqual([]);
  });

  it("flags are off unless on for everyone or the account is allow-listed", async () => {
    expect(flags.flagAllows(undefined, "a@example.com")).toBe(false);
    expect(flags.flagAllows({ enabledForAll: false, allowEmails: ["Ana@example.com"] }, "ANA@example.com")).toBe(true);
    expect(flags.flagAllows({ enabledForAll: false, allowEmails: ["a@example.com"] }, "b@example.com")).toBe(false);
    expect(flags.flagAllows({ enabledForAll: true, allowEmails: [] }, null)).toBe(true);
  });
});
