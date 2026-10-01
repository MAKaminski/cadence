// The writer: turns a profile and a check-in into candidate posts. Two implementations behind one
// interface — Claude for real users, a deterministic template writer for demo mode and tests.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BANNED_PHRASES, LIMITS } from "@/lib/catalog";
import { isDemo } from "@/lib/mode";

export type Model = "claude-sonnet-5" | "claude-opus-5";

/** US dollars per million tokens: [input, output]. Cache writes cost 1.25× input, reads 0.1×. */
export const PRICES: Record<Model, [number, number]> = { "claude-sonnet-5": [2, 10], "claude-opus-5": [5, 25] };

export type Brief = {
  about: { role?: string; audience?: string; goals?: string };
  facts: string[]; voiceSamples: string[]; topics: string[]; noGo: string[];
  notes: string; recent: string[]; count: number; model: Model;
  /** What the person's rated examples teach (src/services/examples.ts guidanceText), or absent. */
  examples?: string;
};
export type Candidate = { angle: string; why: string; variants: string[] };
export type Usage = { model: string; tokensIn: number; tokensOut: number; costUsd: number };

export interface Writer {
  name: string;
  write(b: Brief): Promise<{ posts: Candidate[]; usage: Usage }>;
  rewrite(b: Brief, draft: string, problems: string[]): Promise<{ text: string; usage: Usage }>;
}

export function writer(): Writer {
  return isDemo() || !process.env.ANTHROPIC_API_KEY ? mockWriter : claudeWriter;
}

// ---------------------------------------------------------------------------------------------
// Claude

const RULES = `You write LinkedIn posts for one person, in their voice, from their own notes.

Hard rules:
- State only facts found in FACTS or in this week's NOTES. Never invent numbers, employers, clients, results or credentials. If a point needs a number you don't have, make it without one.
- Never mention anything on the NEVER list.
- Plain text only. No markdown, no bold, no headings. Short paragraphs separated by blank lines.
- First line under ${LIMITS.hookChars} characters: it is all most readers see before "see more".
- Aim for ${Math.round(LIMITS.targetChars * 0.7)}–${LIMITS.targetChars} characters. At most ${LIMITS.maxHashtags} hashtags, at the end, or none.
- Avoid these phrases: ${BANNED_PHRASES.join("; ")}.
- Match the person's own sentence length, tone and habits from their SAMPLES. Don't copy the samples.
- Don't repeat a point from RECENT posts.`;

const Output = z.object({
  posts: z.array(z.object({
    angle: z.string().describe("A 2–5 word name for the angle, e.g. 'Lesson from a mistake'"),
    why: z.string().describe("One sentence: why this angle suits this person's goal and audience"),
    variants: z.array(z.string()).describe(`Exactly ${LIMITS.variants} different takes on the angle, each a complete post`),
  })),
});

function profileBlock(b: Brief) {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n") || "- (none)";
  return `WHO: ${b.about.role ?? ""}\nAUDIENCE: ${b.about.audience ?? ""}\nGOAL: ${b.about.goals ?? ""}\n\nFACTS:\n${list(b.facts)}\n\nTOPICS:\n${list(b.topics)}\n\nNEVER:\n${list(b.noGo)}\n\nSAMPLES:\n${b.voiceSamples.map((s, i) => `--- sample ${i + 1}\n${s}`).join("\n")}`;
}

function cost(model: Model, u: Anthropic.Usage): Usage {
  const [pi, po] = PRICES[model];
  const cw = u.cache_creation_input_tokens ?? 0, cr = u.cache_read_input_tokens ?? 0;
  const tokensIn = u.input_tokens + cw + cr;
  const usd = (u.input_tokens * pi + cw * pi * 1.25 + cr * pi * 0.1 + u.output_tokens * po) / 1e6;
  return { model, tokensIn, tokensOut: u.output_tokens, costUsd: Math.round(usd * 1e6) / 1e6 };
}

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const claudeWriter: Writer = {
  name: "claude",
  async write(b) {
    const res = await client().messages.parse({
      model: b.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // The rules never change and the profile changes rarely, so both are cached.
      system: [{ type: "text", text: RULES }, { type: "text", text: profileBlock(b), cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `NOTES (this week):\n${b.notes}\n\nRECENT posts:\n${b.recent.slice(0, 5).map((r) => `--- \n${r}`).join("\n") || "(none)"}${b.examples ? `\n\nEXAMPLES:\n${b.examples}` : ""}\n\nWrite ${b.count} post${b.count > 1 ? "s" : ""}, each on a different angle from the notes, with ${LIMITS.variants} variants each.`,
      }],
      output_config: { format: zodOutputFormat(Output) },
    });
    if (!res.parsed_output) throw new Error(`The writer returned no usable drafts (stop reason: ${res.stop_reason}).`);
    return { posts: res.parsed_output.posts.slice(0, b.count), usage: cost(b.model, res.usage) };
  },
  async rewrite(b, draft, problems) {
    const res = await client().messages.create({
      model: b.model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: RULES }, { type: "text", text: profileBlock(b), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Revise this post to fix: ${problems.join("; ")}. Keep the point and the voice. Reply with the post only.\n\n${draft}` }],
    });
    const text = res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("").trim();
    return { text, usage: cost(b.model, res.usage) };
  },
};

// ---------------------------------------------------------------------------------------------
// Demo writer: deterministic, free, and built only from what the user entered — so the checks behave
// exactly as they would on real drafts. It deliberately includes markdown and extra hashtags so the
// "fixed automatically" step is visible in the demo.

const sentences = (s: string) => s.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 3);
const tagify = (t: string) => `#${t.replace(/[^\p{L}\p{N}]+/gu, "")}`;

export const mockWriter: Writer = {
  name: "demo",
  async write(b) {
    const notes = sentences(b.notes);
    const facts = b.facts.length ? b.facts : ["what I've learned"];
    const tags = [...b.topics.map(tagify), "#Leadership", "#Growth"].slice(0, 5).join(" ");
    const posts: Candidate[] = Array.from({ length: b.count }, (_, i) => {
      const lead = notes[i % Math.max(notes.length, 1)] ?? "Something came up this week worth sharing.";
      const next = notes[(i + 1) % Math.max(notes.length, 1)];
      const fact = facts[i % facts.length];
      const topic = b.topics[i % Math.max(b.topics.length, 1)] ?? "the work";
      const angles = ["Lesson from the week", "A question I keep getting", "What I'd do differently"];
      return {
        angle: angles[i % angles.length],
        why: `Turns this week's notes into something useful for ${b.about.audience || "your audience"}, backed by one fact from your list.`,
        variants: [
          `${lead}\n\n${next && next !== lead ? `${next}\n\n` : ""}Where that comes from: **${fact}**.\n\nIf you're working on ${topic}, I'd start there. What would you add?\n\n${tags}`,
          `Here's the thing about ${topic} that nobody puts in the plan, and it is the reason most teams I talk to end up redoing the work a quarter later.\n\n${lead}\n\n${fact}.`,
        ],
      };
    });
    const tokensIn = 3000 + b.notes.length, tokensOut = 900 * b.count;
    return { posts, usage: { model: `${b.model} (demo)`, tokensIn, tokensOut, costUsd: 0 } };
  },
  async rewrite(_b, draft) {
    // Drop the over-long opening line and any stock phrase; that's what the checks flagged.
    const lines = draft.split("\n\n");
    const text = lines.slice(1).join("\n\n").replace(/here's the thing about/gi, "About");
    return { text, usage: { model: "demo", tokensIn: 800, tokensOut: 300, costUsd: 0 } };
  },
};
