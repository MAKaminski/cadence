import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { parseManualNumbers } from "@/lib/metric-input";
import { PERSONA } from "@/lib/demo-persona";

describe("numbers typed in from LinkedIn's analytics", () => {
  it("takes whole numbers, with commas, and treats blanks as 0", () => {
    expect(parseManualNumbers({ impressions: "1,204", membersReached: "890", reactions: "31", comments: "", reshares: "2", linkClicks: "7" })).toEqual({
      ok: true, value: { impressions: 1204, reactions: 31, comments: 0, reshares: 2, details: { membersReached: 890, linkClicks: 7 } },
    });
  });

  it("needs impressions, and refuses negatives, decimals, text and reach above impressions", () => {
    expect(parseManualNumbers({ reactions: "3" })).toMatchObject({ ok: false, error: "Impressions is required." });
    for (const bad of ["-1", "1.5", "lots", "9999999999"]) expect(parseManualNumbers({ impressions: bad }).ok, bad).toBe(false);
    expect(parseManualNumbers({ impressions: "100", membersReached: "101" })).toMatchObject({ ok: false });
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

d("saving numbers for a published post", () => {
  let db: typeof import("@/db"), s: typeof import("@/db/schema"), pubs: typeof import("@/services/publications");
  const U = `nums-${Date.now()}`, OTHER = `${U}-other`;
  let pubId = "";

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, CADENCE_DEMO: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters" });
    db = await import("@/db"); s = await import("@/db/schema"); pubs = await import("@/services/publications");
    const drafting = await import("@/lib/drafting"), publishing = await import("@/lib/publishing");
    for (const id of [U, OTHER]) await db.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false });
    await db.asUser(U, async (tx) => {
      await tx.insert(s.profiles).values({
        userId: U, about: { role: PERSONA.role, audience: PERSONA.audience, goals: PERSONA.goals }, facts: lines(PERSONA.facts),
        voiceSamples: PERSONA.samples, topics: lines(PERSONA.topics), noGo: lines(PERSONA.noGo), onboardingStep: 4,
        cadence: { perWeek: 1, days: ["Tue"], time: "09:00", tz: "America/New_York" },
      });
      await tx.insert(s.platformAccounts).values({ userId: U, platform: "linkedin", externalId: "urn:li:person:test" });
    });
    const [i] = await db.asUser(U, (tx) => tx.insert(s.inputs).values({ userId: U, kind: "checkin", body: PERSONA.checkin }).returning());
    await drafting.draftFromCheckin(U, i.id);
    const [draft] = await db.asUser(U, (tx) => tx.select().from(s.drafts).where(eq(s.drafts.platform, "linkedin")));
    await db.asUser(U, (tx) => drafting.approveInTx(tx, U, draft.id));
    await publishing.publishDraft(U, draft.id);
    [{ id: pubId }] = await db.asUser(U, (tx) => tx.select({ id: s.publications.id }).from(s.publications).where(eq(s.publications.draftId, draft.id)));
  });
  afterAll(async () => { for (const id of [U, OTHER]) await db.db.delete(s.user).where(eq(s.user.id, id)); });

  it("keeps each save as a snapshot; Published shows the latest, marked as entered by hand, and Results charts it", async () => {
    await pubs.recordMetrics(U, pubId, { impressions: "500", reactions: "10" });
    await new Promise((r) => setTimeout(r, 5));
    await pubs.recordMetrics(U, pubId, { impressions: "1,200", membersReached: "800", reactions: "30", comments: "4", reshares: "1", followersGained: "2" });
    const [p] = (await pubs.listPublications(U)).filter((x) => x.id === pubId);
    expect(p.latest).toMatchObject({ impressions: 1200, reactions: 30, comments: 4, reshares: 1, source: "manual", details: { membersReached: 800, followersGained: 2 } });
    const snapshots = await db.asUser(U, (tx) => tx.select().from(s.metrics).where(eq(s.metrics.publicationId, pubId)));
    expect(snapshots.filter((m) => (m.platformData as { source?: string }).source === "manual")).toHaveLength(2);
    const { impact } = await import("@/services/stats");
    expect((await impact(U)).find((x) => x.publicationId === pubId)).toMatchObject({ impressions: 1200, engagements: 35 });
  });

  it("refuses bad numbers and other people's posts", async () => {
    await expect(pubs.recordMetrics(U, pubId, { impressions: "" })).rejects.toThrow("Impressions is required.");
    await expect(pubs.recordMetrics(OTHER, pubId, { impressions: "5" })).rejects.toThrow(/isn't published/);
  });
});
