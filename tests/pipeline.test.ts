// Check-in -> drafts -> approve -> publish, against a real Postgres, in demo mode (template writer,
// recording publisher). Includes the publish-safety test: the process dies right after the platform
// accepts a post, and exactly one publication remains, marked for review, never retried.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { eq, sql } from "drizzle-orm";
import { PERSONA } from "@/lib/demo-persona";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

d("drafting and publishing pipeline", () => {
  let db: typeof import("@/db"), s: typeof import("@/db/schema");
  let drafting: typeof import("@/lib/drafting"), publishing: typeof import("@/lib/publishing"), jobs: typeof import("@/lib/jobs");
  const U = `pipe-${Date.now()}`;

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters" });
    db = await import("@/db"); s = await import("@/db/schema");
    drafting = await import("@/lib/drafting"); publishing = await import("@/lib/publishing"); jobs = await import("@/lib/jobs");
    await db.db.insert(s.user).values({ id: U, name: U, email: `${U}@example.com`, emailVerified: false });
    await db.asUser(U, async (tx) => {
      await tx.insert(s.profiles).values({
        userId: U, about: { role: PERSONA.role, audience: PERSONA.audience, goals: PERSONA.goals }, facts: lines(PERSONA.facts),
        voiceSamples: PERSONA.samples, topics: lines(PERSONA.topics), noGo: lines(PERSONA.noGo), onboardingStep: 4,
        cadence: { perWeek: 2, days: ["Tue", "Thu"], time: "09:00", tz: "America/New_York" },
      });
      await tx.insert(s.platformAccounts).values({ userId: U, platform: "linkedin", externalId: "urn:li:person:test" });
    });
  });
  afterAll(async () => { await db.db.delete(s.user).where(eq(s.user.id, U)); });

  const checkin = async () => {
    const [i] = await db.asUser(U, (tx) => tx.insert(s.inputs).values({ userId: U, kind: "checkin", body: PERSONA.checkin }).returning());
    await drafting.draftFromCheckin(U, i.id);
  };
  const newDrafts = () => db.asUser(U, (tx) => tx.select().from(s.drafts).where(sql`${s.drafts.status} in ('draft','held')`));

  it("writes one checked draft per weekly post and records why", async () => {
    await checkin();
    const rows = await newDrafts();
    expect(rows).toHaveLength(2);
    const gate = rows[0].gate as import("@/engine/types").GateRecord;
    expect(gate.checks.map((c) => c.id)).toEqual(expect.arrayContaining(["format", "hook", "facts", "no_go", "repeat"]));
    expect(gate.adjustments.join(" ")).toMatch(/markdown|hashtags/i); // the demo writer's markdown was fixed
    expect(rows[0].body).not.toMatch(/\*\*/);
  });

  it("publishes an approved draft exactly once", async () => {
    const [draft] = await newDrafts();
    await db.asUser(U, (tx) => drafting.approveInTx(tx, U, draft.id));
    expect(await publishing.publishDraft(U, draft.id)).toMatch(/^Published urn:li:share:demo-/);
    expect(await publishing.publishDraft(U, draft.id)).toMatch(/no longer scheduled|already/);
    const pubs = await db.asUser(U, (tx) => tx.select().from(s.publications).where(eq(s.publications.draftId, draft.id)));
    expect(pubs.map((p) => p.status)).toEqual(["published"]);
  });

  it("captures results after publishing and reports them through the stats service", async () => {
    const stats = await import("@/services/stats");
    const [pub] = await db.asUser(U, (tx) => tx.select().from(s.publications).where(eq(s.publications.status, "published")));
    expect(await publishing.captureMetrics(U, pub.id)).toMatch(/^captured \d+ impressions$/);
    const weeks = await stats.outreach(U, 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toMatchObject({ posts: 1, target: 2 });
    const posts = await stats.impact(U);
    expect(posts).toHaveLength(1);
    expect(posts[0].sample).toBe(true);
    expect(posts[0].rate).toBeGreaterThan(0);
    expect((await stats.whatWorks(U)).map((w) => w.dimension).sort()).toEqual(["angle", "length", "weekday"]);
    // Publishing queued the 1, 3 and 7 day captures.
    const queued = await db.asUser(U, (tx) => tx.select().from(s.jobs).where(eq(s.jobs.kind, "metrics")));
    expect(queued).toHaveLength(publishing.METRIC_CAPTURE_HOURS.length);
  });

  it("refuses text that changed after approval", async () => {
    const [draft] = await newDrafts();
    await db.asUser(U, (tx) => drafting.approveInTx(tx, U, draft.id));
    await db.asUser(U, (tx) => tx.update(s.drafts).set({ body: `${draft.body} (changed)` }).where(eq(s.drafts.id, draft.id)));
    expect(await publishing.publishDraft(U, draft.id)).toMatch(/text changed/);
  });

  it("a crash after the platform says yes leaves one publication, for review, never retried", async () => {
    await checkin();
    const [draft] = await newDrafts();
    await db.asUser(U, (tx) => drafting.approveInTx(tx, U, draft.id));
    const child = spawnSync("pnpm", ["exec", "tsx", "tests/fixtures/publish-once.ts", U, draft.id], {
      env: { ...process.env, CADENCE_FAULT: "after_publish" }, encoding: "utf8",
    });
    expect(child.status).toBe(86);
    await db.db.update(s.publications).set({ createdAt: new Date(Date.now() - 6 * 60_000) }).where(eq(s.publications.draftId, draft.id));
    await jobs.recoverLost();
    const pubs = await db.asUser(U, (tx) => tx.select().from(s.publications).where(eq(s.publications.draftId, draft.id)));
    expect(pubs.map((p) => p.status)).toEqual(["needs_review"]);
    expect(await publishing.publishDraft(U, draft.id)).toMatch(/already has a publication/);
  });

  it("stops drafting at the monthly cap", async () => {
    await db.asUser(U, (tx) => tx.insert(s.llmUsage).values({ userId: U, model: "test", tokensIn: 0, tokensOut: 0, costUsd: "5.000000" }));
    await expect(checkin()).rejects.toBeInstanceOf(drafting.CapReached);
  });
});
