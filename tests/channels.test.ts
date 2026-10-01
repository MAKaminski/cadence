// Channels: the registry, X's character counting, the X adapter against a stubbed API, and (against a
// real Postgres, demo mode) an X version drafted, approved into its own slot and published.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { PLATFORMS, PLATFORM_IDS, connectable, lengthOn, spec, specByProvider, xLength } from "@/platforms/registry";
import { evaluate } from "@/engine/evaluate";
import { PERSONA } from "@/lib/demo-persona";

describe("the channel registry", () => {
  it("has one entry per database value, and the live ones are LinkedIn and X", async () => {
    const { platform } = await import("@/db/app-schema");
    expect([...platform.enumValues].sort()).toEqual([...PLATFORM_IDS].sort());
    expect(PLATFORMS.filter((p) => p.status === "live").map((p) => p.id)).toEqual(["linkedin", "x"]);
    expect(specByProvider("twitter")?.id).toBe("x");
    expect(specByProvider("tiktok")).toBeUndefined(); // planned channels never link
  });

  it("offers Connect only when the server's own app keys are real", () => {
    expect(connectable("x", { X_CLIENT_ID: "", X_CLIENT_SECRET: "" })).toBe(false);
    expect(connectable("x", { X_CLIENT_ID: "preview", X_CLIENT_SECRET: "preview" })).toBe(false);
    expect(connectable("x", { X_CLIENT_ID: "test-x-client-id", X_CLIENT_SECRET: "test-x-client-secret" })).toBe(true);
    expect(connectable("pinterest", { PINTEREST_APP_ID: "test-pinterest-id", PINTEREST_APP_SECRET: "test-pinterest-secret" })).toBe(false); // planned
  });

  it("counts characters the way X does", () => {
    expect(xLength("hello")).toBe(5);
    expect(xLength("see https://example.com/a/very/long/path/that/x/shortens?x=1")).toBe(4 + 23);
    expect(xLength("日本語")).toBe(6);
    expect(xLength("ship it 🚀")).toBe(8 + 2);
    expect(xLength("café — “quoted”")).toBe(15);
    expect(lengthOn(spec("linkedin"), "日本語")).toBe(3);
  });

  it("checks an X post against X's limits", () => {
    const ctx = { facts: [], notes: [], topics: [], noGo: [], recent: [] };
    const long = evaluate("A".repeat(300), ctx, spec("x"));
    expect(long.checks.find((c) => c.id === "hard_length")).toMatchObject({ label: "X limit", outcome: "held" });
    const ok = evaluate("**Short** post #one #two #three", ctx, spec("x"));
    expect(ok.text).toBe("Short post #one #two");
    expect(ok.checks[0].label).toBe("X formatting");
  });
});

describe("the X adapter", () => {
  const fake = (status: number, body: unknown) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("posts and returns the post's id and link", async () => {
    let sent: RequestInit | undefined;
    const f = (async (_u: string, init: RequestInit) => { sent = init; return new Response(JSON.stringify({ data: { id: "1840000000000000001", text: "hi" } }), { status: 201 }); }) as unknown as typeof fetch;
    const { postToX } = await import("@/platforms/x-api");
    expect(await postToX("tok", "hi", f)).toEqual({ externalId: "1840000000000000001", url: "https://x.com/i/web/status/1840000000000000001" });
    expect(JSON.parse(String(sent!.body))).toEqual({ text: "hi" });
    expect((sent!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("treats refusals as definite (nothing posted) and server errors as unknown", async () => {
    const { postToX } = await import("@/platforms/x-api");
    await expect(postToX("tok", "hi", fake(403, { detail: "You are not allowed to create a Tweet with duplicate content." }))).rejects.toMatchObject({ definite: true });
    await expect(postToX("tok", "hi", fake(401, ""))).rejects.toMatchObject({ definite: true, message: expect.stringMatching(/Reconnect X/) });
    await expect(postToX("tok", "hi", fake(429, ""))).rejects.toMatchObject({ definite: true });
    await expect(postToX("tok", "hi", fake(503, "busy"))).rejects.toMatchObject({ definite: false });
    const boom = (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch;
    await expect(postToX("tok", "hi", boom)).rejects.toMatchObject({ definite: false });
  });

  it("maps X's public numbers onto Cadence's four", async () => {
    const { metricsFromX } = await import("@/platforms/x-api");
    expect(metricsFromX({ impression_count: 900, like_count: 12, reply_count: 3, retweet_count: 2, quote_count: 1 })).toEqual({ impressions: 900, reactions: 12, comments: 3, reshares: 3 });
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

d("an X version of every post", () => {
  let db: typeof import("@/db"), s: typeof import("@/db/schema");
  let drafting: typeof import("@/lib/drafting"), publishing: typeof import("@/lib/publishing"), channels: typeof import("@/services/channels");
  const U = `chan-${Date.now()}`;

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters" });
    db = await import("@/db"); s = await import("@/db/schema");
    drafting = await import("@/lib/drafting"); publishing = await import("@/lib/publishing"); channels = await import("@/services/channels");
    await db.db.insert(s.user).values({ id: U, name: U, email: `${U}@example.com`, emailVerified: false });
    await db.asUser(U, async (tx) => {
      await tx.insert(s.profiles).values({
        userId: U, about: { role: PERSONA.role, audience: PERSONA.audience, goals: PERSONA.goals }, facts: lines(PERSONA.facts),
        voiceSamples: PERSONA.samples, topics: lines(PERSONA.topics), noGo: lines(PERSONA.noGo), onboardingStep: 4,
        cadence: { perWeek: 1, days: ["Tue"], time: "09:00", tz: "America/New_York" },
      });
      await tx.insert(s.platformAccounts).values({ userId: U, platform: "linkedin", externalId: "urn:li:person:test" });
    });
    await channels.connectDemo(U, "x");
  });
  afterAll(async () => { await db.db.delete(s.user).where(eq(s.user.id, U)); });

  const checkin = async () => {
    const [i] = await db.asUser(U, (tx) => tx.insert(s.inputs).values({ userId: U, kind: "checkin", body: PERSONA.checkin }).returning());
    await drafting.draftFromCheckin(U, i.id);
  };
  const open = (platform: "linkedin" | "x") => db.asUser(U, (tx) => tx.select().from(s.drafts).where(sql`${s.drafts.status} in ('draft','held') and ${s.drafts.platform} = ${platform}`));

  it("every live channel has an adapter", async () => {
    const { hasAdapter } = await import("@/platforms");
    expect(PLATFORMS.filter((p) => p.status === "live").every((p) => hasAdapter(p.id))).toBe(true);
  });

  it("writes an X version that fits, linked to its LinkedIn draft", async () => {
    await checkin();
    const [li] = await open("linkedin"), [x] = await open("x");
    expect(x).toBeDefined();
    expect(xLength(x.body)).toBeLessThanOrEqual(280);
    const gate = x.gate as import("@/engine/types").GateRecord;
    expect(gate.adaptedFrom).toBe(li.id);
    expect(gate.adjustments[0]).toBe("Written for X from the LinkedIn draft");
    expect(gate.checks.find((c) => c.id === "hard_length")?.label).toBe("X limit");
  });

  it("schedules both in the same slot (slots are per channel) and publishes the X one to X", async () => {
    const [li] = await open("linkedin"), [x] = await open("x");
    const a = await db.asUser(U, (tx) => drafting.approveInTx(tx, U, li.id));
    const b = await db.asUser(U, (tx) => drafting.approveInTx(tx, U, x.id));
    expect(b.toISOString()).toBe(a.toISOString());
    expect(await publishing.publishDraft(U, x.id)).toMatch(/^Published x:demo-/);
    const [pub] = await db.asUser(U, (tx) => tx.select().from(s.publications).where(eq(s.publications.draftId, x.id)));
    expect(pub.platform).toBe("x");
  });

  it("stops X versions when its switch is off, and lists every channel", async () => {
    await channels.setDrafting(U, "x", false);
    const before = (await db.asUser(U, (tx) => tx.select().from(s.drafts).where(eq(s.drafts.platform, "x")))).length;
    await checkin();
    expect((await db.asUser(U, (tx) => tx.select().from(s.drafts).where(eq(s.drafts.platform, "x")))).length).toBe(before);
    const list = await channels.listChannels(U);
    expect(list).toHaveLength(PLATFORMS.length);
    expect(list.find((c) => c.id === "x")?.connection).toMatchObject({ drafting: false });
    expect(list.find((c) => c.id === "tiktok")).toMatchObject({ status: "planned", connectable: false, connection: null });
    await channels.disconnect(U, "x");
    expect((await channels.listChannels(U)).find((c) => c.id === "x")?.connection).toBeNull();
    await expect(channels.disconnect(U, "linkedin")).rejects.toThrow(/LinkedIn's settings/);
  });
});
