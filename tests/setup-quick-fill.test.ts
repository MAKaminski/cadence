import { describe, expect, it } from "vitest";
import { makeZip } from "./fixtures/zip";
import { archetypes, defaultsOf, joinList, picksFor, splitList, toggle } from "@/lib/setup-picks";
import { csv, factsFrom, hasContent, readExport, samplesFrom, wanted } from "@/lib/linkedin-export";
import { readTexts } from "@/lib/zip-lite";
import { ruleSuggester } from "@/lib/setup-suggest";
import { voiceSchema } from "@/services/profile";

// A LinkedIn export as it arrives: notes above some headers, quoted multi-line posts, files in a folder.
const PROFILE = `First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
Dana,Reyes,,,,"Swing trader | Options educator","I trade 2-10 day swings and teach risk first.",Financial Services,,"Atlanta, Georgia",,,`;
const POSITIONS = `Company Name,Title,Description,Location,Started On,Finished On
Reyes Trading LLC,Founder and trader,"Trades US equities and options",Atlanta,Mar 2021,
Acme Bank,Equity analyst,,New York,Jun 2016,Feb 2021`;
const SKILLS = `Name
Technical Analysis
Options
Risk Management`;
const POST = "Lost 2R on a breakout this week.\n\nThe setup was fine. The size wasn't: I doubled it after two winners. Back to fixed risk per trade, and a note in the journal so I see it next time.";
const SHARES = `Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility
2026-09-20 14:01:00,https://lnkd.in/x,"${POST.replace(/"/g, '""')}",,,MEMBER_NETWORK
2026-09-01 09:00:00,https://lnkd.in/y,"Short one.",,,MEMBER_NETWORK
2026-08-11 09:00:00,https://lnkd.in/z,"Three rules I keep: size by the stop, never add to a loser, and journal every trade the same night. The journal is the edge.",,,MEMBER_NETWORK`;
const CONNECTIONS = `Notes:\n"When exporting your connection data, you may notice..."\n\nFirst Name,Last Name,URL\nA,B,https://x`;

const zip = () => makeZip([
  { name: "Basic_LinkedInDataExport_10-01-2026/Profile.csv", data: PROFILE },
  { name: "Basic_LinkedInDataExport_10-01-2026/Positions.csv", data: POSITIONS },
  { name: "Basic_LinkedInDataExport_10-01-2026/Skills.csv", data: SKILLS, method: 0 },
  { name: "Basic_LinkedInDataExport_10-01-2026/Shares.csv", data: SHARES },
  { name: "Basic_LinkedInDataExport_10-01-2026/Connections.csv", data: CONNECTIONS },
  { name: "Basic_LinkedInDataExport_10-01-2026/messages.csv", data: "private" },
]);

describe("quick picks", () => {
  it("suggest for the kind of work, with the right defaults ticked", () => {
    expect(archetypes("I'm a short and medium term trader", "More traders interested in subscribing to my channel")).toEqual(["trader", "creator"]);
    const p = picksFor("I'm a short and medium term trader", "subscribers to my channel");
    expect(defaultsOf(p.audience)).toEqual(["Active retail traders", "Swing and position traders"]);
    expect(defaultsOf(p.goals)).toContain("Grow subscribers to my channel");
    expect(defaultsOf(p.noGo)).toEqual(expect.arrayContaining(["Personalized investment advice", "Promises of returns", "Politics"]));
    expect(p.topics.map((x) => x.label)).toContain("Behind the scenes"); // from the second match, not ticked
    expect(defaultsOf(p.topics)).not.toContain("Behind the scenes");
    expect(defaultsOf(p.style).length).toBeGreaterThan(0);
  });
  it("lead with what's said first, and fall back to generic defaults", () => {
    expect(archetypes("Founder of a trading app")[0]).toBe("founder");
    expect(defaultsOf(picksFor("").goals)).toEqual(["Build a following in my niche", "Be known as an expert"]);
  });
  it("never offer a topic with a comma (topics are stored comma-separated)", () => {
    for (const role of ["trader", "founder", "engineer", "sales", "cfo", "consultant", "designer", "recruiter", "open to work", "youtube", ""])
      for (const k of ["topics", "noGo"] as const) for (const x of picksFor(role)[k]) expect(x.label).not.toContain(",");
  });
  it("round-trip through the stored text", () => {
    expect(splitList("audience", "Traders; Options traders\nTraders")).toEqual(["Traders", "Options traders"]);
    expect(joinList("topics", ["Risk management", "Trade reviews"])).toBe("Risk management, Trade reviews");
    expect(splitList("topics", joinList("topics", ["A", "B"]))).toEqual(["A", "B"]);
    expect(toggle(["A", "B"], "a")).toEqual(["B"]);
    expect(toggle(["A"], "C")).toEqual(["A", "C"]);
  });
});

describe("LinkedIn export", () => {
  it("parses quoted, multi-line CSV", () => {
    expect(csv('a,b\n"x, y","line1\nline2 ""q"""\n')).toEqual([["a", "b"], ["x, y", 'line1\nline2 "q"']]);
  });
  it("reads only the files setup needs out of the zip, in the browser's way", async () => {
    const texts = await readTexts(new Blob([new Uint8Array(zip())]), wanted);
    expect(Object.keys(texts).map((k) => k.split("/").pop()).sort()).toEqual(["Positions.csv", "Profile.csv", "Shares.csv", "Skills.csv"]);
    const p = readExport(texts);
    expect(hasContent(p)).toBe(true);
    expect(p).toMatchObject({ name: "Dana Reyes", headline: "Swing trader | Options educator", location: "Atlanta, Georgia", skills: ["Technical Analysis", "Options", "Risk Management"] });
    expect(factsFrom(p)).toEqual(["Founder and trader at Reyes Trading LLC, 2021–present", "Equity analyst at Acme Bank, 2016–2021", "Based in Atlanta, Georgia"]);
    expect(samplesFrom(p)).toEqual([POST, expect.stringContaining("Three rules I keep")]); // the short one is left out
  });
  it("copes with an export missing files", () => {
    expect(hasContent(readExport({ "Connections.csv": CONNECTIONS }))).toBe(false);
  });
});

describe("quick fill without a model", () => {
  it("fills setup from the export: its headline, its facts, its posts, and picks for a trader", async () => {
    const linkedin = readExport(await readTexts(new Blob([new Uint8Array(zip())]), wanted));
    const { suggestion: s, usage } = await ruleSuggester.suggest({ linkedin, role: "", audience: [], goals: [], facts: [] });
    expect(usage).toBeNull();
    expect(s.role).toBe("Swing trader | Options educator");
    expect(s.facts).toContain("Equity analyst at Acme Bank, 2016–2021");
    expect(s.samples).toHaveLength(2);
    expect(s.audience).toContain("Active retail traders");
    expect(s.noGo).toContain("Personalized investment advice");
    expect(s.topics).toEqual(expect.arrayContaining(["Risk management", "Technical Analysis"]));
    expect(s.from).toEqual(["your LinkedIn export"]);
  });
  it("keeps what the person already typed", async () => {
    const { suggestion: s } = await ruleSuggester.suggest({ role: "CFO for startups", audience: ["Seed founders"], goals: [], facts: ["CPA"] });
    expect(s).toMatchObject({ role: "CFO for startups", audience: ["Seed founders"], facts: ["CPA"] });
    expect(s.goals).toEqual(["Win clients", "Be known as an expert"]);
  });
});

describe("voice step", () => {
  const base = { topics: "Risk management", noGo: "" };
  it("takes two posts, or a picked style when there are none yet", () => {
    expect(voiceSchema.safeParse({ ...base, samples: ["", "", ""], style: [] }).success).toBe(false);
    expect(voiceSchema.safeParse({ ...base, samples: ["", "", ""], style: ["Short paragraphs"] }).success).toBe(true);
    expect(voiceSchema.safeParse({ ...base, samples: [POST, POST, ""] }).success).toBe(true);
  });
});
