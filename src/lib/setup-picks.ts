// Quick picks for setup: the options a person clicks instead of typing, chosen from what they say they
// do. Defaults are deliberate — most people take them — so each list marks the few that suit most people
// in that line of work. Pure and client-safe: the stepper recomputes picks as the role is typed.

export type Pick = { label: string; default?: boolean };
export type PickKey = "audience" | "goals" | "topics" | "noGo" | "style";
export type Picks = Record<PickKey, Pick[]>;

type Archetype = { id: string; match: RegExp } & Partial<Record<PickKey, Pick[]>>;

const d = (label: string): Pick => ({ label, default: true });
const o = (label: string): Pick => ({ label });

// First match leads (its defaults win); a second match adds its options without defaults.
// Labels never contain commas: topics and the never-list are stored comma- or line-separated.
const ARCHETYPES: Archetype[] = [
  { id: "trader", match: /\btrad(e|er|ers|ing)\b|invest|options?\b|portfolio|hedge fund|equit(y|ies)|crypto|forex|futures|\bmarkets?\b|swing|day trad/i,
    audience: [d("Active retail traders"), d("Swing and position traders"), o("Options traders"), o("Long-term investors"), o("People learning to trade")],
    goals: [d("Grow subscribers to my channel"), d("Be known for a clear trading process"), o("Build a following in my niche"), o("Find students or members")],
    topics: [d("Trade reviews and lessons"), d("Risk management"), d("Trading psychology"), d("Market structure"), o("Options strategies"), o("Position sizing"), o("Macro and earnings season")],
    noGo: [d("Personalized investment advice"), d("Promises of returns"), o("Specific buy or sell calls")] },
  { id: "founder", match: /founder|\bceo\b|start-?up|entrepreneur|owner of|my company/i,
    audience: [d("Potential customers"), d("Other founders"), o("Investors"), o("Future hires")],
    goals: [d("Find customers or design partners"), d("Build a following in my niche"), o("Raise money"), o("Hire")],
    topics: [d("Building in public"), d("Lessons from the founder seat"), d("Product and customers"), o("Fundraising"), o("Hiring and team")],
    noGo: [d("Unannounced deals or fundraising"), d("Customer names without permission")] },
  { id: "engineer", match: /engineer|developer|software|programmer|architect|devops|data scien|machine learning|\bml\b|\bai\b|agents?\b/i,
    audience: [d("Engineers who build similar systems"), o("Engineering managers"), o("Hiring managers"), o("Technical founders")],
    goals: [d("Be known as an expert"), d("Grow my network in the field"), o("Get hired or get better offers")],
    topics: [d("Lessons from production"), d("Architecture decisions"), d("AI and agents"), o("Tools and workflows"), o("Career growth")],
    noGo: [d("Employer's internal systems and code")] },
  { id: "sales", match: /sales|account exec|business development|\bbdr?\b|\bsdr\b|marketing|growth|brand|\bseo\b|demand gen/i,
    audience: [d("Buyers in my market"), o("Sales and marketing peers"), o("Founders who need growth")],
    goals: [d("Generate inbound leads"), d("Be known as an expert"), o("Build a following in my niche")],
    topics: [d("What buyers actually want"), d("Playbooks that worked"), o("Lessons from deals"), o("Pipeline and metrics")],
    noGo: [d("Client names without permission"), d("Pricing and contract terms")] },
  { id: "finance", match: /\bcfo\b|finance|financial|accountant|accounting|controller|\bcpa\b|bank|lend|credit|fp&a|treasury/i,
    audience: [d("Founders and executives"), o("Finance peers"), o("Hiring managers")],
    goals: [d("Win clients"), d("Be known as an expert"), o("Get hired")],
    topics: [d("Cash and runway"), d("Lessons from the numbers"), o("Fundraising"), o("Finance operations")],
    noGo: [d("Client financials"), o("Personalized investment advice")] },
  { id: "consultant", match: /consult|coach|advis|freelanc|fractional|agency/i,
    audience: [d("Potential clients"), o("Peers in my field")],
    goals: [d("Win clients"), d("Be known as an expert")],
    topics: [d("Client lessons"), d("Frameworks I use"), o("Common mistakes I see")],
    noGo: [d("Client names without permission")] },
  { id: "product", match: /product manager|\bpm\b|product lead|designer|\bux\b|\bui\b|design lead/i,
    audience: [d("Product and design peers"), o("Hiring managers"), o("Founders")],
    goals: [d("Be known as an expert"), o("Get hired or get better offers")],
    topics: [d("Product decisions and trade-offs"), d("Talking to users"), o("Design craft")],
    noGo: [d("Unreleased product plans")] },
  { id: "recruiter", match: /recruit|talent|\bhr\b|people ops|human resources/i,
    audience: [d("Candidates in my market"), d("Hiring managers")],
    goals: [d("Fill roles faster"), o("Build a talent network")],
    topics: [d("What hiring managers look for"), d("Interview advice"), o("Market for talent")],
    noGo: [d("Candidate names and details")] },
  { id: "seeker", match: /looking for|open to work|job ?seek|seeking|between roles|laid off|next role/i,
    audience: [d("Hiring managers"), d("Recruiters in my field")],
    goals: [d("Get hired"), o("Grow my network")],
    topics: [d("What I'm good at"), d("Lessons from my last role"), o("Projects I've shipped")],
    noGo: [d("Former employer's confidential details")] },
  { id: "creator", match: /creator|youtube|podcast|newsletter|substack|\bwriter\b|channel|streamer|subscrib|community/i,
    audience: [d("People who'd subscribe to my channel"), o("Other creators")],
    goals: [d("Grow subscribers to my channel"), o("Drive traffic to my content")],
    topics: [d("Behind the scenes"), o("My best recent content")] },
];

const GENERIC: Picks = {
  audience: [o("People in my industry"), o("Hiring managers"), o("Potential clients"), o("Peers I want to learn from")],
  goals: [o("Build a following in my niche"), o("Be known as an expert"), o("Get hired"), o("Find clients or customers"), o("Grow my network")],
  topics: [o("Lessons learned at work"), o("How I approach my craft"), o("Industry trends"), o("Career growth")],
  noGo: [d("Politics"), d("Religion"), d("Confidential employer information"), o("Salary and compensation"), o("Personal health"), o("Family")],
  style: [d("Plain-spoken, no jargon"), d("Short paragraphs"), d("Teaching and how-to"), o("Personal stories"), o("Data and numbers"), o("Contrarian takes"), o("Humor")],
};
// With nothing to go on, the generic lists carry the defaults instead.
const GENERIC_DEFAULTS: Partial<Record<PickKey, string[]>> = {
  audience: ["People in my industry"], goals: ["Build a following in my niche", "Be known as an expert"], topics: ["Lessons learned at work", "How I approach my craft"],
};

export const KEYS: PickKey[] = ["audience", "goals", "topics", "noGo", "style"];

/** Which kinds of work the text describes, strongest first (the role before the audience). */
export function archetypes(...texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    // Within one text, what's said first leads: "founder of a trading app" is a founder.
    const hits = ARCHETYPES.map((a) => ({ id: a.id, at: t ? t.search(a.match) : -1 })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
    for (const h of hits) if (!out.includes(h.id)) out.push(h.id);
  }
  return out;
}

/** The options for each list: the matched kinds of work first, then the generic ones. */
export function picksFor(role: string, audience = ""): Picks {
  const ids = archetypes(role, audience).slice(0, 2);
  const found = ids.map((id) => ARCHETYPES.find((a) => a.id === id)!);
  const out = {} as Picks;
  for (const k of KEYS) {
    const seen = new Map<string, Pick>();
    found.forEach((a, i) => (a[k] ?? []).forEach((p) => { if (!seen.has(p.label.toLowerCase())) seen.set(p.label.toLowerCase(), i === 0 ? p : o(p.label)); }));
    const generic = GENERIC[k].map((p) => (!found.length && GENERIC_DEFAULTS[k]?.includes(p.label) ? d(p.label) : p));
    for (const p of generic) if (!seen.has(p.label.toLowerCase())) seen.set(p.label.toLowerCase(), p);
    out[k] = [...seen.values()];
  }
  return out;
}

export const defaultsOf = (picks: Pick[]) => picks.filter((p) => p.default).map((p) => p.label);

/** Audience and goals are free sentences, so they're kept apart with semicolons; topics and the never-list
 *  with commas or new lines, as setup has always stored them. */
const SEP: Record<PickKey, RegExp> = { audience: /[;\n]/, goals: /[;\n]/, topics: /[,\n]/, noGo: /[,\n]/, style: /[;\n]/ };
const JOIN: Record<PickKey, string> = { audience: "; ", goals: "; ", topics: ", ", noGo: ", ", style: "; " };

export function splitList(k: PickKey, s: string): string[] {
  const seen = new Set<string>();
  return s.split(SEP[k]).map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}

export const joinList = (k: PickKey, items: string[]) => items.map((x) => x.trim()).filter(Boolean).join(JOIN[k]);

/** Add or remove one item, case-insensitively, keeping the order picked. */
export function toggle(items: string[], label: string): string[] {
  const i = items.findIndex((x) => x.toLowerCase() === label.toLowerCase());
  return i >= 0 ? items.filter((_, j) => j !== i) : [...items, label];
}
