// Reads one example (its text and, when there is one, its image or GIF) and describes how it works:
// the hook, the shape, the visual and its motion, the close. Structure only: never the topic or the
// words, because what transfers to someone else's feed is the shape. Claude for real users, a
// deterministic reader in demo mode and tests.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isDemo } from "@/lib/mode";
import { PRICES, type Model, type Usage } from "@/lib/llm";

export const Analysis = z.object({
  format: z.enum(["text", "image", "carousel", "video", "animation", "link", "other"]),
  hook: z.object({ type: z.string().describe("e.g. contrarian claim, number, question, story, list promise"), firstLine: z.string().describe("The opening line, quoted, or empty") }),
  structure: z.string().describe("The shape in a few words, e.g. 'numbered list of 12 layers, 3 techniques each'"),
  length: z.enum(["short", "medium", "long"]),
  tone: z.string(),
  visual: z.object({
    kind: z.string().describe("e.g. infographic, chart, photo, screenshot, carousel slide, none"),
    layout: z.string(), motion: z.string().describe("How it moves, or 'static'"), notes: z.string(),
  }).nullable(),
  cta: z.object({ type: z.string().describe("e.g. question, follow, DM keyword, link, none"), engagementBait: z.boolean() }),
  strengths: z.array(z.string()).describe("Up to 5 things that make it work, as reusable techniques"),
  weaknesses: z.array(z.string()).describe("Up to 5 things that weaken it"),
  transferable: z.string().describe("One sentence: the technique someone else could reuse, with no topic words"),
  summary: z.string().describe("One sentence: what this example is"),
});
export type AnalysisT = z.infer<typeof Analysis>;

export type ExampleInput = {
  url: string | null; title: string | null; author: string | null; body: string | null; note: string | null;
  mediaKind: string; image: { mime: string; data: Buffer } | null;
};

export interface Analyst { analyze(e: ExampleInput, model: Model): Promise<{ analysis: AnalysisT; usage: Usage }> }

export const analyst = (): Analyst => (isDemo() || !process.env.ANTHROPIC_API_KEY ? mockAnalyst : claudeAnalyst);

const SYSTEM = `You study LinkedIn posts and visuals that one person saved as examples, so their own posts can learn from them.
Describe how the example works: its hook, shape, length, tone, visual and motion, and how it closes.
Describe technique, never topic: the analysis must be reusable by someone writing about something else.
Never copy sentences from the example into strengths, weaknesses or transferable.
Call a close engagement bait when it trades a keyword, comment or DM for a reward.`;

/** Image types Claude reads directly; a GIF is read from its frames as Claude sees them. */
const READABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const claudeAnalyst: Analyst = {
  async analyze(e, model) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const content: Anthropic.ContentBlockParam[] = [];
    if (e.image && READABLE.has(e.image.mime)) {
      content.push({ type: "image", source: { type: "base64", media_type: e.image.mime as "image/png", data: e.image.data.toString("base64") } });
    }
    content.push({ type: "text", text: [
      `Example${e.url ? ` from ${e.url}` : ""}${e.author ? ` by ${e.author}` : ""}.`,
      e.title ? `Title: ${e.title}` : "",
      e.body ? `Post text:\n${e.body}` : "No post text.",
      `Media: ${e.mediaKind}${e.mediaKind === "gif" ? " (animated; describe the motion you can infer)" : ""}.`,
      e.note ? `The person's note: ${e.note}` : "",
    ].filter(Boolean).join("\n\n") });
    const res = await client.messages.parse({
      model, max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(Analysis) },
    });
    if (!res.parsed_output) throw new Error(`No analysis came back (stop reason: ${res.stop_reason}).`);
    const [pi, po] = PRICES[model];
    const u = res.usage, tokensIn = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const costUsd = Math.round(((tokensIn * pi) + u.output_tokens * po)) / 1e6;
    return { analysis: res.parsed_output, usage: { model, tokensIn, tokensOut: u.output_tokens, costUsd } };
  },
};

/** Demo: derived only from what was added, so the page and the drafting hand-off behave as for real. */
export const mockAnalyst: Analyst = {
  async analyze(e) {
    const text = e.body ?? "";
    const first = text.split(/\n|(?<=[.!?])\s/)[0]?.trim() ?? "";
    const list = /(^|\n)\s*(\d+[.)]|[-•])\s/.test(text);
    const visual = e.mediaKind === "none" ? null : {
      kind: e.mediaKind === "pdf" ? "carousel" : e.mediaKind === "video" ? "video" : "infographic",
      layout: "single frame", motion: e.mediaKind === "gif" ? "looping animation" : e.mediaKind === "video" ? "video" : "static",
      notes: "Demo analysis: shapes are inferred from what was added.",
    };
    const bait = /\b(DM|[Cc]omment)\b.{0,20}["'“][A-Z]{2,}["'”]/.test(text);
    const analysis: AnalysisT = {
      format: e.mediaKind === "gif" ? "animation" : e.mediaKind === "video" ? "video" : e.mediaKind === "pdf" ? "carousel" : e.mediaKind === "image" ? "image" : "text",
      hook: { type: /\?$/.test(first) ? "question" : /\d/.test(first) ? "number" : "statement", firstLine: first.slice(0, 140) },
      structure: list ? "numbered list" : visual ? `${visual.kind} with a short caption` : "short paragraphs",
      length: text.length < 400 ? "short" : text.length < 1300 ? "medium" : "long",
      tone: "direct",
      visual,
      cta: { type: bait ? "DM keyword" : /\?\s*$/.test(text.trim()) ? "question" : "none", engagementBait: bait },
      strengths: [list ? "Skimmable list that rewards saving" : "One idea per paragraph", ...(visual ? [`The ${visual.kind} carries the point on its own`] : [])],
      weaknesses: bait ? ["Closes on a keyword-for-DM trade"] : [],
      transferable: list ? "Promise a complete list up front, then deliver every item in the same pattern." : visual ? `Let one ${visual.kind} carry the idea and keep the text short.` : "Lead with the claim and give one concrete reason per paragraph.",
      summary: `${e.title ?? "An example"}${e.author ? ` by ${e.author}` : ""}.`,
    };
    return { analysis, usage: { model: "demo", tokensIn: 0, tokensOut: 0, costUsd: 0 } };
  },
};
