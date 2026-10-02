// LinkedIn Engine history into Cadence (against a real Postgres): posts become published drafts with their
// pillar, hook and score; every capture of the numbers becomes a snapshot; a second import adds nothing;
// Results reads the new breakdowns and totals.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { pillarLabel, postUrn } from "@/services/engine-import";
import { engineExport } from "./fixtures/engine-export";

describe("engine export parts", () => {
  it("keys posts by their LinkedIn id and labels pillars", () => {
    expect(postUrn("https://www.linkedin.com/feed/update/urn:li:activity:12345/")).toBe("urn:li:activity:12345");
    expect(postUrn("https://example.com")).toBeNull();
    expect(pillarLabel("operator-math")).toBe("Operator math");
    expect(pillarLabel(null)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("importing LinkedIn Engine history", () => {
  const U = `engine-${Date.now()}`;
  let mod: typeof import("@/db"), s: typeof import("@/db/schema"), svc: typeof import("@/services/engine-import"), stats: typeof import("@/services/stats");
  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url });
    mod = await import("@/db"); s = await import("@/db/schema"); svc = await import("@/services/engine-import"); stats = await import("@/services/stats");
    await mod.db.insert(s.user).values({ id: U, name: U, email: `${U}@example.com`, emailVerified: false });
    await mod.asUser(U, (tx) => tx.insert(s.profiles).values({ userId: U, cadence: { perWeek: 3, days: ["Tue"], time: "09:00", tz: "UTC" } }));
  });
  afterAll(async () => { await mod.db.delete(s.user).where(eq(s.user.id, U)); });

  const BASE = 10_000 + Math.floor(Math.random() * 80_000), ENGINE_EXPORT = engineExport(BASE);
  it("adds each post once, with every capture of its numbers, and skips what it can't key", async () => {
    const first = await svc.importEnginePosts(U, ENGINE_EXPORT.posts);
    expect(first).toEqual({ added: 3, existing: 0, snapshots: 4, skipped: 1 });
    const again = await svc.importEnginePosts(U, ENGINE_EXPORT.posts);
    expect(again).toEqual({ added: 0, existing: 3, snapshots: 0, skipped: 1 });

    const rows = await mod.asUser(U, (tx) => tx.select({ gate: s.drafts.gate, body: s.drafts.body, status: s.drafts.status, ext: s.publications.externalPostId, at: s.publications.publishedAt })
      .from(s.publications).innerJoin(s.drafts, eq(s.drafts.id, s.publications.draftId)).orderBy(s.publications.publishedAt));
    expect(rows.map((r) => r.ext)).toEqual([0, 1, 2].map((n) => `urn:li:activity:${BASE + n}`));
    expect(rows[1]).toMatchObject({ status: "published", gate: { angle: "Field note", hook: "wrong-turn", rubricScore: 25, source: "linkedin-engine" } });
    expect(rows[2].body).toBe("");
    expect(rows[0].at?.toISOString()).toBe("2026-08-06T16:02:47.000Z");
  });

  it("feeds Results: totals, the latest numbers per post, and breakdowns by hook and rubric score", async () => {
    const since = new Date("2026-08-01T00:00:00Z");
    const t = await stats.totals(U, "linkedin", since);
    expect(t).toMatchObject({ posts: 3, withNumbers: 3, impressions: 940 + 12959 + 300, engagements: 16 + 53 + 2 });
    expect(t.best).toMatchObject({ impressions: 12959, excerpt: expect.stringMatching(/^I authored Terraform/) });
    const works = await stats.whatWorks(U, "linkedin", since);
    expect(works.filter((w) => w.dimension === "hook").map((w) => w.label).sort()).toEqual(["Contradiction", "Wrong Turn"]);
    expect(works.find((w) => w.dimension === "score" && w.label === "27–30")).toMatchObject({ posts: 1, rate: 16 / 940 });
    expect(works.find((w) => w.dimension === "angle" && w.label === "Field note")).toMatchObject({ posts: 1 });
    expect(works.find((w) => w.dimension === "length" && w.label === "Text not kept")).toMatchObject({ posts: 1 });
    expect((await stats.impact(U, 30, "linkedin", since)).map((p) => p.impressions)).toEqual([940, 12959, 300]);
    expect(await stats.totals(U, "linkedin", new Date("2026-09-01T00:00:00Z"))).toMatchObject({ posts: 0, rate: null, best: null });
  });
});
