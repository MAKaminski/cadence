// Eight weeks of back-dated sample posts with sample results, marked as sample data everywhere. Used by
// demo mode's "sample history" button and by App Review accounts, so the Results charts have a story.
import { asUser } from "@/db";

export async function addSampleHistory(userId: string) {
  const { drafts, publications, metrics } = await import("@/db/schema");
  const angles = ["Lesson from the week", "A question I keep getting", "What I'd do differently"];
  const openers = [
    "Most founders model revenue first. Model cash first.",
    "A founder asked me this week whether they need a CFO yet.",
    "We closed the books in 4 days. No new software.",
    "Subsidies change the timing of cash, not just the amount.",
    "Grid interconnection queues are a forecasting problem.",
    "The first finance hire should be a habit, not a person.",
  ];
  const now = Date.now();
  await asUser(userId, async (tx) => {
    for (let w = 8; w >= 1; w--) {
      const perWeek = w % 3 === 0 ? 1 : w % 4 === 0 ? 2 : 3; // a realistic, slightly uneven history
      for (let i = 0; i < perWeek; i++) {
        const at = new Date(now - w * 7 * 86_400_000 + i * 2 * 86_400_000);
        const opener = openers[(w * 3 + i) % openers.length];
        const body = `${opener}\n\n${"Sample post for the demo history. ".repeat(4 + ((w + i) % 5) * 6)}`.trim();
        const [d] = await tx.insert(drafts).values({
          userId: userId, platform: "linkedin", body, status: "published", scheduledFor: at, createdAt: at,
          gate: { angle: angles[(w + i) % 3], why: "Sample history (demo).", checks: [], adjustments: [], verdict: "ok", rewritten: false, model: "demo", costUsd: 0, variantsConsidered: 2 },
        }).returning({ id: drafts.id });
        const [p] = await tx.insert(publications).values({
          userId: userId, draftId: d.id, platform: "linkedin", status: "published", externalPostId: `urn:li:share:demo-h${w}${i}${d.id.slice(0, 4)}`, publishedAt: at, createdAt: at,
        }).returning({ id: publications.id });
        const impressions = 900 + ((w * 7 + i * 13) % 11) * 310 + (8 - w) * 120;
        const rate = 0.014 + (((w + i * 2) % 6) / 1000) * (angles[(w + i) % 3].startsWith("A question") ? 3 : 1);
        await tx.insert(metrics).values({
          userId: userId, publicationId: p.id, platform: "linkedin", capturedAt: new Date(at.getTime() + 72 * 3_600_000),
          impressions, reactions: Math.round(impressions * rate), comments: Math.round(impressions * rate * 0.2), reshares: Math.round(impressions * rate * 0.05),
          platformData: { sample: true },
        });
      }
    }
  });
}
