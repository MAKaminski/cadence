// Public API contract, in-process via api.request(): auth, scopes, rate limits, the paywall and tenant
// isolation. Needs TEST_DATABASE_URL (migrated).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("public API", () => {
  let api: typeof import("@/api/app").api;
  let auth: typeof import("@/lib/auth").auth;
  let db: typeof import("@/db"), s: typeof import("@/db/schema");
  const A = `api-a-${Date.now()}`, B = `api-b-${Date.now()}`;
  let keyRead = "", keyWrite = "", keyApprove = "", keyB = "";
  let draftA = "", draftB = "";

  const call = (path: string, key: string, init: RequestInit = {}) =>
    api.request(`/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...init.headers } });
  const mk = async (userId: string, scopes: string[], rateLimitMax = 60) =>
    (await auth.api.createApiKey({ body: { userId, name: scopes.join("+"), permissions: { cadence: scopes }, rateLimitEnabled: true, rateLimitMax, rateLimitTimeWindow: 60_000 } })).key;

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters" });
    ({ api } = await import("@/api/app")); ({ auth } = await import("@/lib/auth"));
    db = await import("@/db"); s = await import("@/db/schema");
    for (const id of [A, B]) {
      await db.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false });
      await db.db.insert(s.subscription).values({ id: randomUUID(), plan: "cadence", referenceId: id, status: "trialing" });
      await db.asUser(id, (tx) => tx.insert(s.profiles).values({ userId: id, about: { role: "Tester" }, facts: ["Ran 3 tests"], topics: ["testing"], onboardingStep: 4 }));
    }
    const draft = (userId: string) => db.asUser(userId, async (tx) => (await tx.insert(s.drafts).values({
      userId, platform: "linkedin", body: `Draft for ${userId}. Testing is a habit.`, status: "draft",
      gate: { angle: "Test", why: "Test", checks: [], adjustments: [], verdict: "ok", rewritten: false, model: "demo", costUsd: 0, variantsConsidered: 2 },
    }).returning({ id: s.drafts.id }))[0].id);
    draftA = await draft(A); draftB = await draft(B);
    keyRead = await mk(A, ["read"]); keyWrite = await mk(A, ["read", "write"]); keyApprove = await mk(A, ["read", "write", "approve"]); keyB = await mk(B, ["read"]);
  });
  afterAll(async () => {
    await db.db.delete(s.apikey).where(sql`${s.apikey.referenceId} in (${A}, ${B})`);
    await db.db.delete(s.subscription).where(sql`${s.subscription.referenceId} in (${A}, ${B})`);
    await db.db.delete(s.user).where(sql`${s.user.id} in (${A}, ${B})`);
  });

  it("publishes an OpenAPI 3.1 document with no publish-now endpoint", async () => {
    const r = await api.request("/api/v1/openapi.json");
    const doc = await r.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(["/api/v1/me", "/api/v1/checkins", "/api/v1/drafts/{id}/approve", "/api/v1/stats/impact"]));
    expect(JSON.stringify(doc.paths)).not.toMatch(/publish-now/);
    expect(doc.info["x-disclaimer"]).toMatch(/not affiliated/);
  });

  it("rejects missing and invalid keys with problem+json", async () => {
    const r1 = await api.request("/api/v1/me");
    expect(r1.status).toBe(401);
    expect(r1.headers.get("content-type")).toMatch(/problem\+json/);
    expect((await call("/me", "cad_nope")).status).toBe(401);
  });

  it("returns your account with rate-limit headers", async () => {
    const r = await call("/me", keyRead);
    expect(r.status).toBe(200);
    expect((await r.json()).scopes).toEqual(["read"]);
    expect(r.headers.get("RateLimit-Limit")).toBe("60");
    expect(Number(r.headers.get("RateLimit-Remaining"))).toBeLessThan(60);
  });

  it("enforces scopes: read can't write, write can't approve, approve can", async () => {
    expect((await call("/checkins", keyRead, { method: "POST", body: JSON.stringify({ body: "A week of notes about testing things properly." }) })).status).toBe(403);
    expect((await call("/checkins", keyWrite, { method: "POST", body: JSON.stringify({ body: "A week of notes about testing things properly." }) })).status).toBe(202);
    expect((await call(`/drafts/${draftA}/approve`, keyWrite, { method: "POST" })).status).toBe(403);
    const ok = await call(`/drafts/${draftA}/approve`, keyApprove, { method: "POST" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("scheduled");
  });

  it("validates input and returns 422", async () => {
    const r = await call("/checkins", keyWrite, { method: "POST", body: JSON.stringify({ body: "short" }) });
    expect(r.status).toBe(422);
  });

  it("keeps tenants apart: user B's key can't see user A's draft", async () => {
    expect((await call(`/drafts/${draftA}`, keyB)).status).toBe(404);
    expect((await call(`/drafts/${draftB}`, keyB)).status).toBe(200);
  });

  it("rate limits with 429 and Retry-After", async () => {
    const tight = await mk(A, ["read"], 2);
    expect((await call("/me", tight)).status).toBe(200);
    expect((await call("/me", tight)).status).toBe(200);
    const r = await call("/me", tight);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("returns 401 for a revoked key and 402 without a subscription", async () => {
    const temp = await mk(A, ["read"]);
    const [row] = await db.db.select().from(s.apikey).where(eq(s.apikey.referenceId, A)).orderBy(sql`${s.apikey.createdAt} desc`).limit(1);
    await db.db.delete(s.apikey).where(eq(s.apikey.id, row.id));
    expect((await call("/me", temp)).status).toBe(401);
    await db.db.update(s.subscription).set({ status: "canceled" }).where(eq(s.subscription.referenceId, B));
    expect((await call("/me", keyB)).status).toBe(402);
  });
});
