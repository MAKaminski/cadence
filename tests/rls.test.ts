// Tenant isolation, proven against a real Postgres (TEST_DATABASE_URL, migrated). The app logs in as a
// superuser in production (the postgres container's login), and superusers bypass row-level security — so this checks the thing that
// actually protects users: the switch to the unprivileged role inside asUser().
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("row-level security", () => {
  let mod: typeof import("@/db");
  let s: typeof import("@/db/schema");
  const A = `rls-a-${Date.now()}`, B = `rls-b-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    mod = await import("@/db");
    s = await import("@/db/schema");
    for (const id of [A, B]) {
      await mod.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false });
      await mod.asUser(id, (tx) => tx.insert(s.profiles).values({ userId: id, about: { role: id } }));
      await mod.asUser(id, (tx) => tx.insert(s.inputs).values({ userId: id, kind: "checkin", body: `note from ${id}` }));
    }
  });

  afterAll(async () => {
    await mod.db.delete(s.user).where(sql`${s.user.id} in (${A}, ${B})`);
  });

  it("a user sees only their own rows, even with no WHERE clause", async () => {
    const rows = await mod.asUser(A, (tx) => tx.select().from(s.inputs));
    expect(rows.map((r) => r.userId)).toEqual([A]);
  });

  it("a user cannot read another user's row by its id", async () => {
    const [bRow] = await mod.db.select().from(s.inputs).where(eq(s.inputs.userId, B));
    const seen = await mod.asUser(A, (tx) => tx.select().from(s.inputs).where(eq(s.inputs.id, bRow.id)));
    expect(seen).toEqual([]);
  });

  it("a user cannot write a row that belongs to someone else", async () => {
    await expect(mod.asUser(A, (tx) => tx.insert(s.inputs).values({ userId: B, kind: "note", body: "forged" }))).rejects.toThrow();
  });

  it("a user cannot change another user's profile", async () => {
    await mod.asUser(A, (tx) => tx.update(s.profiles).set({ about: { role: "hijacked" } }).where(eq(s.profiles.userId, B)));
    const [b] = await mod.db.select().from(s.profiles).where(eq(s.profiles.userId, B));
    expect(b.about).toEqual({ role: B });
  });

  it("every table with a user_id column has the tenant policy and the app role's grants", async () => {
    const rows = await mod.db.execute(sql`
      select c.table_name,
             exists (select 1 from pg_policies p where p.tablename = c.table_name and p.policyname = c.table_name || '_tenant') as policy,
             has_table_privilege('cadence_app', c.table_name, 'select') as can_read
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'user_id'
        and c.table_name not in ('session', 'account', 'apikey', 'oauth_access_token', 'oauth_refresh_token', 'oauth_consent', 'oauth_client')`);
    const bad = (rows as unknown as { table_name: string; policy: boolean; can_read: boolean }[]).filter((r) => !r.policy || !r.can_read).map((r) => r.table_name);
    expect(bad).toEqual([]);
  });

  it("plans are per user: schedules, pauses and planner settings", async () => {
    const plan = await import("@/services/plan");
    await plan.setPosting(A, { perWeek: 5 });
    await plan.setEngage(A, { perDay: 4 });
    await plan.setHold(A, "all", "testing");
    const a = await plan.getPlan(A), b = await plan.getPlan(B);
    expect(a.posting.perWeek).toBe(5);
    expect(a.engage.perDay).toBe(4);
    expect(a.holds.map((h) => h.name)).toEqual(["all"]);
    expect(b.engage.rows).toEqual([]);
    expect(b.holds).toEqual([]);
    expect(b.posting.rows.every((r) => r.key.startsWith("posting:"))).toBe(true);
    const seen = await mod.asUser(B, (tx) => tx.select().from(s.schedules).where(eq(s.schedules.userId, A)));
    expect(seen).toEqual([]);
    await expect(mod.asUser(B, (tx) => tx.insert(s.schedules).values({ userId: A, key: "engage:99", family: "engage", localTime: "12:00", executor: "runner" }))).rejects.toThrow();
  });

  it("the worker can see every user's rows, for claiming jobs", async () => {
    const rows = await mod.asWorker((tx) => tx.select().from(s.inputs).where(sql`${s.inputs.userId} in (${A}, ${B})`));
    expect(rows).toHaveLength(2);
  });
});
