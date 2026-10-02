// A LinkedIn Engine export as scripts/engine-export.mjs writes it: three posts, one without its text,
// numbers captured more than once. Post ids are made up and fresh per call: a LinkedIn post belongs to one
// Cadence account, and tests run side by side in one database.
export function engineExport(base = 10_000 + Math.floor(Math.random() * 80_000)) {
  const id = (n: number) => `https://www.linkedin.com/feed/update/urn:li:activity:${base + n}/`;
  return {
  version: 1, source: "linkedin-engine", exportedAt: "2026-10-02T19:00:00Z",
  posts: [
    { url: id(0), postedAt: "2026-08-06T16:02:47Z",
      body: "Anthropic publishes two numbers about agents that most people read as one. Here is why the difference matters for anyone pricing agent work.",
      pillar: "signal", hook: "contradiction", visual: "none", topic: "agents", score: 29,
      snapshots: [{ at: "2026-08-07T22:59:15Z", impressions: 186, reactions: null, comments: null, reposts: null }, { at: "2026-08-10T11:55:45Z", impressions: 940, reactions: 12, comments: 3, reposts: 1 }] },
    { url: id(1), postedAt: "2026-08-06T22:33:11Z",
      body: "I authored Terraform modules and owned multi-environment remote state for three years. The wrong turn I made first is the one most teams make.",
      pillar: "field-note", hook: "wrong-turn", visual: "none", topic: "terraform", score: 25,
      snapshots: [{ at: "2026-08-10T11:55:45Z", impressions: 12959, reactions: 44, comments: 9, reposts: 0 }] },
    { url: id(2), postedAt: "2026-08-10T09:00:00Z",
      body: null, pillar: null, hook: null, visual: null, topic: null, score: null,
      snapshots: [{ at: "2026-08-12T09:00:00Z", impressions: 300, reactions: 2, comments: 0, reposts: 0 }] },
    { url: "not a linkedin url", postedAt: "2026-08-10T09:00:00Z", snapshots: [] },
  ],
};
}
