// Export a LinkedIn Engine account's history for Cadence's importer (Import → LinkedIn Engine).
// Reads the engine's D1 database through Cloudflare's API — read-only, SELECTs only — and writes one JSON
// file: every post with its text (when the engine kept it), pillar, hook, visual, rubric score, posting
// time and latest numbers.
//
//   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… D1_DATABASE_ID=… node scripts/engine-export.mjs [out.json]
import { writeFileSync } from "node:fs";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, D1_DATABASE_ID: db } = process.env;
if (!token || !account || !db) { console.error("Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID."); process.exit(1); }
const out = process.argv[2] ?? "linkedin-engine-export.json";

async function query(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("read-only: SELECT only");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sql }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors));
  return j.result[0].results;
}

const json = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
// LinkedIn post IDs carry their creation time: the top 41 bits are milliseconds since 1970.
const idTime = (url) => { const m = url?.match(/urn:li:(?:activity|share|ugcPost):(\d+)/); return m ? new Date(Number(BigInt(m[1]) >> 22n)).toISOString() : null; };

// The engine's posts table is a ledger: one row when a post goes out (its text, pillar, hook, score), then
// one row per capture of its numbers. Superseded rows were replaced. Grouped here into one post each, with
// every capture kept as a snapshot, so Cadence gets the numbers' history too.
const rows = await query(`select url, pillar, hook_type, visual, body, topic_key, scores, score_total, posted_utc,
  superseded, impressions, reactions, comments, reposts, metrics_updated from posts order by _line`);
const byUrl = new Map();
for (const r of rows) {
  if (!r.url || r.superseded) continue;
  const p = byUrl.get(r.url) ?? { url: r.url, postedAt: null, body: null, pillar: null, hook: null, visual: null, topic: null, score: null, scores: null, snapshots: [] };
  if (r.body) Object.assign(p, { body: r.body, pillar: r.pillar ?? null, hook: r.hook_type ?? null, visual: r.visual ?? null, topic: r.topic_key ?? null, score: r.score_total ?? null, scores: json(r.scores) });
  if (r.posted_utc && !p.postedAt) p.postedAt = r.posted_utc;
  if (r.impressions != null || r.reactions != null || r.comments != null || r.reposts != null)
    p.snapshots.push({ at: r.metrics_updated ?? r.posted_utc ?? null, impressions: r.impressions, reactions: r.reactions, comments: r.comments, reposts: r.reposts });
  byUrl.set(r.url, p);
}
const posts = [...byUrl.values()].map((p) => ({ ...p, postedAt: p.postedAt ?? idTime(p.url) })).filter((p) => p.postedAt).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
const data = { version: 1, source: "linkedin-engine", exportedAt: new Date().toISOString(), posts };
writeFileSync(out, JSON.stringify(data));
const n = (f) => posts.filter(f).length;
console.log(`${out}: ${posts.length} posts (${n((p) => p.body)} with text, ${n((p) => p.snapshots.length)} with numbers, ${posts.reduce((a, p) => a + p.snapshots.length, 0)} snapshots), ${posts[0]?.postedAt.slice(0, 10)} to ${posts.at(-1)?.postedAt.slice(0, 10)}`);
