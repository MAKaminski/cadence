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

  it("the worker can see every user's rows, for claiming jobs", async () => {
    const rows = await mod.asWorker((tx) => tx.select().from(s.inputs).where(sql`${s.inputs.userId} in (${A}, ${B})`));
    expect(rows).toHaveLength(2);
  });
});
