// Reading a LinkedIn data export (linkedin.com → Settings → Data privacy → Get a copy of your data).
// LinkedIn's sign-in shares only a name, email and photo, so this archive is how setup learns a person's
// headline, roles, skills and posts. Pure and client-safe: the browser reads the CSVs it needs out of the
// zip (src/lib/zip-lite.ts) and only those reach the server. Every column is optional; LinkedIn renames
// them now and then, and some files open with a few lines of notes before the header.

export type LinkedInProfile = {
  name: string; headline: string; summary: string; industry: string; location: string;
  positions: { title: string; company: string; start: string; end: string; description: string }[];
  education: { school: string; degree: string; end: string }[];
  skills: string[];
  posts: { date: string; text: string }[];
};

/** The files setup reads, by name inside the archive (any folder, any case). */
export const WANTED = ["profile.csv", "positions.csv", "education.csv", "skills.csv", "shares.csv"] as const;
export const wanted = (path: string) => (WANTED as readonly string[]).includes(path.split("/").pop()!.toLowerCase());

/** RFC 4180: quoted fields may hold commas, doubled quotes and new lines. */
export function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"' && f === "") q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = ""; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Rows as objects, from the first row that has `header` among its cells. */
function table(text: string | undefined, header: string): Record<string, string>[] {
  if (!text) return [];
  const rows = csv(text);
  const at = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === header.toLowerCase()));
  if (at < 0) return [];
  const keys = rows[at].map((k) => k.trim().toLowerCase());
  return rows.slice(at + 1).map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const year = (s: string) => s.match(/(19|20)\d\d/)?.[0] ?? "";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Everything setup can use, from the export's CSVs keyed by file name (any folder, any case). */
export function readExport(files: Record<string, string>): LinkedInProfile {
  const byName: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) byName[path.split("/").pop()!.toLowerCase()] = text;
  const prof = table(byName["profile.csv"], "Headline");
  const [p = {}] = prof.length ? prof : table(byName["profile.csv"], "First Name");
  return {
    name: [p["first name"], p["last name"]].filter(Boolean).join(" "),
    headline: p.headline ?? "", summary: p.summary ?? "", industry: p.industry ?? "",
    location: p["geo location"] ?? p.location ?? "",
    positions: table(byName["positions.csv"], "Company Name").map((r) => ({
      title: r.title ?? "", company: r["company name"] ?? "", start: r["started on"] ?? "", end: r["finished on"] ?? "", description: r.description ?? "",
    })).filter((x) => x.title || x.company),
    education: table(byName["education.csv"], "School Name").map((r) => ({ school: r["school name"] ?? "", degree: r["degree name"] ?? "", end: r["end date"] ?? "" })).filter((x) => x.school),
    skills: table(byName["skills.csv"], "Name").map((r) => r.name).filter(Boolean),
    posts: table(byName["shares.csv"], "ShareCommentary").map((r) => ({ date: r.date ?? "", text: (r.sharecommentary ?? "").replace(/\\n/g, "\n").trim() }))
      .filter((x) => x.text).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** True when the export held anything setup can use. */
export const hasContent = (p: LinkedInProfile) =>
  Boolean(p.headline || p.summary || p.positions.length || p.education.length || p.skills.length || p.posts.length);

/** "Title at Company" for the current role (no end date), else the latest one. */
export function currentRole(p: LinkedInProfile): string {
  const now = p.positions.find((x) => !x.end) ?? p.positions[0];
  return now ? [now.title, now.company].filter(Boolean).join(" at ") : "";
}

/** Statements Cadence may make, built only from what the export says. */
export function factsFrom(p: LinkedInProfile): string[] {
  const out = p.positions.slice(0, 6).map((x) => {
    const span = year(x.start) ? `, ${year(x.start)}–${x.end ? year(x.end) || x.end : "present"}` : "";
    return `${[x.title, x.company].filter(Boolean).join(" at ")}${span}`;
  });
  for (const e of p.education.slice(0, 2)) out.push([e.degree, e.school].filter(Boolean).join(", ") + (year(e.end) ? ` (${year(e.end)})` : ""));
  if (p.location) out.push(`Based in ${p.location}`);
  return out;
}

/** Three of the person's own posts to learn the voice from: the fullest of their recent ones. */
export function samplesFrom(p: LinkedInProfile): string[] {
  return p.posts.slice(0, 30).filter((x) => x.text.length >= 80).sort((a, b) => b.text.length - a.text.length).slice(0, 3).map((x) => clip(x.text, 3000));
}

/** What the server is sent: enough to suggest answers, nothing else from the archive. */
export function trimmed(p: LinkedInProfile): LinkedInProfile {
  return {
    ...p, headline: clip(p.headline, 300), summary: clip(p.summary, 2000),
    positions: p.positions.slice(0, 8).map((x) => ({ ...x, description: clip(x.description, 400) })),
    education: p.education.slice(0, 4), skills: p.skills.slice(0, 30),
    posts: p.posts.slice(0, 12).map((x) => ({ ...x, text: clip(x.text, 3000) })),
  };
}
