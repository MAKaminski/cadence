// Server pieces the iOS app relies on: push, devices, account deletion, the checkout link and the App
// Review account's publisher. Real Postgres (TEST_DATABASE_URL).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { PERSONA } from "@/lib/demo-persona";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
const TOKEN = "a".repeat(64);

describe("push messages", () => {
  it("say what's ready and never ask to approve", async () => {
    const { message } = await import("@/lib/push-message");
    expect(message({ kind: "drafts_ready", ready: 3, held: 0 }).title).toBe("3 drafts ready");
    expect(message({ kind: "drafts_ready", ready: 1, held: 1 }).title).toBe("2 drafts ready, 1 needs you");
    expect(message({ kind: "connection_expiring", days: 1 }).title).toBe("LinkedIn connection ends in 1 day");
    for (const e of [{ kind: "drafts_ready", ready: 2, held: 1 }, { kind: "posted", excerpt: "x" }, { kind: "checkin_reminder" }] as const) {
      expect(JSON.stringify(message(e))).not.toMatch(/approve/i);
    }
  });
});

d("iOS server support", () => {
  let db: typeof import("@/db"), s: typeof import("@/db/schema");
  let api: typeof import("@/api/app").api, auth: typeof import("@/lib/auth").auth;
  const A = `ios-a-${Date.now()}`, B = `ios-b-${Date.now()}`;
  let keyA = "", keyB = "";

  const call = (path: string, key: string, init: RequestInit = {}) =>
    api.request(`/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" } });

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters" });
    db = await import("@/db"); s = await import("@/db/schema");
    ({ api } = await import("@/api/app")); ({ auth } = await import("@/lib/auth"));
    for (const id of [A, B]) {
      await db.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false });
      await db.asUser(id, (tx) => tx.insert(s.profiles).values({
        userId: id, about: { role: PERSONA.role }, facts: lines(PERSONA.facts), topics: lines(PERSONA.topics), noGo: lines(PERSONA.noGo),
        voiceSamples: PERSONA.samples, onboardingStep: 4, cadence: { perWeek: 2, days: ["Tue", "Thu"], time: "09:00", tz: "America/New_York" },
      }));
    }
    await db.db.insert(s.subscription).values({ id: randomUUID(), plan: "cadence", referenceId: A, status: "trialing" });
    keyA = (await auth.api.createApiKey({ body: { userId: A, permissions: { cadence: ["read", "write"] } } })).key;
    keyB = (await auth.api.createApiKey({ body: { userId: B, permissions: { cadence: ["read", "write"] } } })).key;
  });
  afterAll(async () => {
    await db.db.delete(s.subscription).where(sql`${s.subscription.referenceId} in (${A}, ${B})`);
    await db.db.delete(s.user).where(sql`${s.user.id} in (${A}, ${B})`);
  });

  it("registers a device, moves a token to whoever registers it last, and unregisters", async () => {
    const r = await call("/devices", keyA, { method: "POST", body: JSON.stringify({ token: TOKEN, environment: "sandbox" }) });
    expect(r.status).toBe(201);
    const moved = await call("/devices", keyB, { method: "POST", body: JSON.stringify({ token: TOKEN, environment: "sandbox" }) });
    expect(moved.status).toBe(201); // B has no plan: registering a device still works
    const rows = await db.db.select().from(s.devices).where(eq(s.devices.token, TOKEN));
    expect(rows.map((x) => x.userId)).toEqual([B]);
    expect((await call(`/devices/${rows[0].id}`, keyA, { method: "DELETE" })).status).toBe(404); // not A's
    expect((await call(`/devices/${rows[0].id}`, keyB, { method: "DELETE" })).status).toBe(204);
    expect((await call("/devices", keyA, { method: "POST", body: JSON.stringify({ token: "not-hex", environment: "sandbox" }) })).status).toBe(422);
  });

  it("pushes 'drafts ready' after drafting, to the user's devices only", async () => {
    const { demoOutbox } = await import("@/lib/push");
    const { draftFromCheckin } = await import("@/lib/drafting");
    await call("/devices", keyA, { method: "POST", body: JSON.stringify({ token: TOKEN, environment: "sandbox" }) });
    const before = demoOutbox.length;
    const [i] = await db.asUser(A, (tx) => tx.insert(s.inputs).values({ userId: A, kind: "checkin", body: PERSONA.checkin }).returning());
    await draftFromCheckin(A, i.id);
    const sent = demoOutbox.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ userId: A, token: TOKEN, message: { screen: "week" } });
    expect(sent[0].message.title).toMatch(/drafts? ready/);
  });

  it("sends an App Review account's posts to the recording publisher, even outside demo mode", async () => {
    const { adapterFor } = await import("@/platforms");
    const { mockPlatform } = await import("@/platforms/mock");
    const { linkedin } = await import("@/platforms/linkedin");
    process.env.CADENCE_DEMO = "0";
    try {
      expect(adapterFor("linkedin", { platformData: { reviewer: true } })).toBe(mockPlatform);
      expect(adapterFor("linkedin", { platformData: {} })).toBe(linkedin);
    } finally { process.env.CADENCE_DEMO = "1"; }
  });

  it("gives a checkout link only to accounts without a plan", async () => {
    expect((await call("/billing/checkout-link?from=ios", keyA)).status).toBe(409);
    const r = await call("/billing/checkout-link?from=ios", keyB);
    expect(r.status).toBe(200);
    expect((await r.json()).url).toBe("http://localhost:3000/login?next=%2Fcheckout%3Ffrom%3Dios");
  });

  it("deletes an account completely: no row for the user survives in any table", async () => {
    const { draftFromCheckin } = await import("@/lib/drafting");
    const [i] = await db.asUser(B, (tx) => tx.insert(s.inputs).values({ userId: B, kind: "checkin", body: PERSONA.checkin }).returning());
    await db.db.insert(s.subscription).values({ id: randomUUID(), plan: "cadence", referenceId: B, status: "trialing" });
    await draftFromCheckin(B, i.id);
    await call("/devices", keyB, { method: "POST", body: JSON.stringify({ token: "b".repeat(64), environment: "sandbox" }) });
    const r = await call("/account", keyB, { method: "DELETE", body: JSON.stringify({ confirm: "delete my account" }) });
    expect(r.status).toBe(200);
    // Every table with a user_id or reference_id column, discovered from the schema so new tables are covered.
    const cols = (await db.db.execute(sql`select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_name in ('user_id', 'reference_id', 'id') and table_name <> '__drizzle_migrations'`)) as unknown as { table_name: string; column_name: string }[];
    const leftovers: string[] = [];
    for (const c of cols) {
      if (c.column_name === "id" && c.table_name !== "user") continue;
      const [row] = (await db.db.execute(sql.raw(`select count(*)::int as n from "${c.table_name}" where "${c.column_name}"::text = '${B}'`))) as unknown as { n: number }[];
      if (row.n) leftovers.push(`${c.table_name}.${c.column_name}=${row.n}`);
    }
    expect(leftovers).toEqual([]);
    expect((await call("/me", keyB)).status).toBe(401); // the key went with the account
  });

  it("refuses to delete without the confirmation phrase", async () => {
    expect((await call("/account", keyA, { method: "DELETE", body: JSON.stringify({ confirm: "yes" }) })).status).toBe(422);
  });
});
