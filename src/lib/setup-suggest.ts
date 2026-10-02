// Quick fill for setup: answers drafted from what Cadence can know about a person — their LinkedIn
// export or pasted profile, and whatever they've typed so far. Claude for real users; a rule-based
// version (the same picks, the export's own facts) in demo mode, in tests and without an API key.
// Facts only ever come from the person's own data, never from the model's imagination.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { cost, type Usage } from "@/lib/llm";
import { isDemo } from "@/lib/mode";
import { currentRole, factsFrom, samplesFrom, type LinkedInProfile } from "@/lib/linkedin-export";
import { defaultsOf, picksFor, type PickKey, type Picks } from "@/lib/setup-picks";

export type SetupInput = {
  name?: string; linkedin?: LinkedInProfile; pasted?: string;
  role: string; audience: string[]; goals: string[]; facts: string[];
};
export type SetupSuggestion = {
  role: string; facts: string[]; samples: string[];
  audience: string[]; goals: string[]; topics: string[]; noGo: string[]; style: string[];
  /** What it was drafted from, for the confirmation message. */
  from: string[];
};

const Output = z.object({
  role: z.string().describe("What they do, in their own terms, under 120 characters. Empty if the data doesn't say."),
  facts: z.array(z.string()).describe("Short statements that are explicitly in the data: roles with employer and years, credentials, results with their numbers, location. Never infer or round."),
  audience: z.array(z.string()).describe("2-3 groups their posts should reach"),
  goals: z.array(z.string()).describe("1-2 things posting should do for them"),
  topics: z.array(z.string()).describe("4-6 topics to be known for, 2-5 words each, no commas"),
  noGo: z.array(z.string()).describe("Things to keep out of their posts, no commas"),
  style: z.array(z.string()).describe("2-4 traits of how they write"),
});

const dedupe = (xs: string[]) => { const s = new Set<string>(); return xs.map((x) => x.trim()).filter((x) => x && !s.has(x.toLowerCase()) && s.add(x.toLowerCase())); };
const noCommas = (xs: string[]) => xs.map((x) => x.replace(/,/g, " ·").replace(/\s+/g, " ").trim());

function sources(i: SetupInput) {
  return [i.linkedin && "your LinkedIn export", i.pasted?.trim() && "your pasted profile", (i.role.trim() || i.facts.length) && "your answers so far"].filter(Boolean) as string[];
}

/** A role and facts from pasted profile text, without a model: lines that read like a headline or a job. */
function fromPaste(text: string) {
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length >= 6 && l.length <= 200);
  const role = lines.find((l) => /\s(at|@)\s|\|/.test(l)) ?? "";
  const facts = lines.filter((l) => l !== role && /\s(at|@)\s.+|(19|20)\d\d\s*[-–]\s*((19|20)\d\d|present)/i.test(l)).slice(0, 8);
  return { role, facts };
}

export const ruleSuggester = {
  name: "rules",
  async suggest(i: SetupInput): Promise<{ suggestion: SetupSuggestion; usage: Usage | null }> {
    const li = i.linkedin;
    const paste = i.pasted?.trim() ? fromPaste(i.pasted) : { role: "", facts: [] };
    const role = i.role.trim() || li?.headline || (li ? currentRole(li) : "") || paste.role;
    const picks = picksFor(role, i.audience.join(" "));
    const pick = (k: PickKey) => defaultsOf(picks[k]);
    return {
      suggestion: {
        role, facts: dedupe([...i.facts, ...(li ? factsFrom(li) : []), ...paste.facts]), samples: li ? samplesFrom(li) : [],
        audience: i.audience.length ? i.audience : pick("audience"), goals: i.goals.length ? i.goals : pick("goals"),
        topics: dedupe([...pick("topics"), ...noCommas(li?.skills.slice(0, 3) ?? [])]), noGo: pick("noGo"), style: pick("style"),
        from: sources(i),
      },
      usage: null,
    };
  },
};

const MODEL = "claude-sonnet-5" as const;

function prompt(i: SetupInput, picks: Picks) {
  const li = i.linkedin;
  const opts = (k: PickKey) => picks[k].map((p) => p.label).join("; ");
  return [
    `Draft setup answers for ${i.name || "this person"}, who wants Cadence to write their LinkedIn posts. Prefer these options where they fit, and add your own where none do:`,
    `Audience options: ${opts("audience")}\nGoal options: ${opts("goals")}\nTopic options: ${opts("topics")}\nNever-list options: ${opts("noGo")}\nStyle options: ${opts("style")}`,
    i.role || i.audience.length || i.goals.length ? `THEIR ANSWERS SO FAR (keep them):\nRole: ${i.role}\nAudience: ${i.audience.join("; ")}\nGoals: ${i.goals.join("; ")}\nFacts:\n${i.facts.join("\n")}` : "",
    li ? `LINKEDIN EXPORT:\nHeadline: ${li.headline}\nIndustry: ${li.industry}\nLocation: ${li.location}\nSummary: ${li.summary}\nPositions:\n${li.positions.map((p) => `- ${p.title} at ${p.company} (${p.start || "?"} – ${p.end || "present"}) ${p.description}`).join("\n")}\nEducation:\n${li.education.map((e) => `- ${e.degree} ${e.school} ${e.end}`).join("\n")}\nSkills: ${li.skills.join(", ")}\nRecent posts:\n${li.posts.slice(0, 8).map((p) => `--- ${p.date}\n${p.text}`).join("\n")}` : "",
    i.pasted?.trim() ? `PASTED PROFILE TEXT (copied from their LinkedIn page; ignore navigation and other people):\n${i.pasted.slice(0, 12_000)}` : "",
    "Facts must be stated in the data above, word for word in substance. If something isn't there, leave it out.",
  ].filter(Boolean).join("\n\n");
}

export const claudeSuggester = {
  name: "claude",
  async suggest(i: SetupInput): Promise<{ suggestion: SetupSuggestion; usage: Usage | null }> {
    const rules = (await ruleSuggester.suggest(i)).suggestion;
    const picks = picksFor(rules.role, i.audience.join(" "));
    const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.parse({
      model: MODEL, max_tokens: 3000,
      system: "You help a person set up a tool that drafts their LinkedIn posts. Be concrete and brief. Never invent facts.",
      messages: [{ role: "user", content: prompt(i, picks) }],
      output_config: { format: zodOutputFormat(Output) },
    });
    const out = res.parsed_output;
    if (!out) return { suggestion: rules, usage: cost(MODEL, res.usage) };
    return {
      suggestion: {
        role: i.role.trim() || out.role.trim() || rules.role,
        // The export's own facts first (exact), then what the model found in free text.
        facts: dedupe([...rules.facts, ...out.facts]).slice(0, 20),
        samples: rules.samples,
        audience: i.audience.length ? i.audience : dedupe(out.audience).slice(0, 4),
        goals: i.goals.length ? i.goals : dedupe(out.goals).slice(0, 3),
        topics: dedupe(noCommas(out.topics)).slice(0, 8), noGo: dedupe([...rules.noGo, ...noCommas(out.noGo)]).slice(0, 8),
        style: dedupe(out.style).slice(0, 5),
        from: rules.from,
      },
      usage: cost(MODEL, res.usage),
    };
  },
};

export const suggester = () => (isDemo() || !process.env.ANTHROPIC_API_KEY ? ruleSuggester : claudeSuggester);
