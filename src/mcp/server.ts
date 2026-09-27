// Cadence as an MCP server, for Claude, Codex, Cursor and VS Code. Every tool calls src/services: the
// same rules as the web app and the API. There is deliberately no "publish now" tool.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { me } from "@/services/account";
import { getProfile } from "@/services/profile";
import * as drafts from "@/services/drafts";
import * as stats from "@/services/stats";
import { ServiceError } from "@/services/errors";
import { COUNTS, ROUTINES } from "@/lib/catalog";

export type Caller = { userId: string; scopes: string[] };
type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

const caller = (ctx: Ctx): Caller => {
  const extra = ctx.http?.authInfo?.extra as Partial<Caller> | undefined;
  if (!extra?.userId) throw new ServiceError("forbidden", "Not signed in to Cadence.");
  return { userId: extra.userId, scopes: extra.scopes ?? [] };
};
const need = (c: Caller, scope: string) => {
  if (!c.scopes.includes(scope)) throw new ServiceError("forbidden", `This connection wasn't granted ${scope}. Reconnect Cadence and allow it on the consent screen.`);
};
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const data = (summary: string, obj: unknown) => ({ content: [{ type: "text" as const, text: `${summary}\n\n${JSON.stringify(obj, null, 2)}` }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : "Something went wrong." }] });

/** Wraps a tool body: resolves the caller, checks the scope, turns errors into readable tool errors. */
function tool<A>(scope: string, fn: (c: Caller, args: A) => Promise<ReturnType<typeof text>>) {
  return async (args: A, ctx: Ctx) => {
    try { const c = caller(ctx); need(c, scope); return await fn(c, args); } catch (e) { return fail(e); }
  };
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export function registerCadence(server: McpServer) {
  server.registerTool("get_status", {
    title: "Cadence status",
    description: "The user's Cadence plan, LinkedIn connection, model use this month, and posts this week against their target. Start here.",
    inputSchema: z.object({}), annotations: READ,
  }, tool("cadence:read", async (c) => {
    const [m, [week]] = await Promise.all([me(c.userId), stats.outreach(c.userId, 1)]);
    return data(`${m.name}: ${week.posts} of ${week.target} posts this week; LinkedIn ${m.linkedin?.status ?? "not connected"}; model use $${m.modelUseThisMonthUsd} of $${m.modelAllowanceUsd}.`, { ...m, thisWeek: week });
  }));

  server.registerTool("get_setup", {
    title: "Cadence setup",
    description: "The user's one-time setup: role, audience, goals, the facts Cadence may state, topics, never-write-about list, posting rhythm and model.",
    inputSchema: z.object({}), annotations: READ,
  }, tool("cadence:read", async (c) => data("Setup:", await getProfile(c.userId))));

  server.registerTool("list_drafts", {
    title: "List drafts",
    description: "Drafts waiting for the user (status draft or held) and scheduled posts. Held drafts failed a check and need the user's attention; say why.",
    inputSchema: z.object({ status: z.array(z.enum(drafts.DRAFT_STATUSES)).optional().describe("Defaults to draft, held and scheduled") }), annotations: READ,
  }, tool("cadence:read", async (c, a: { status?: drafts.DraftOut["status"][] }) => {
    const list = await drafts.listDrafts(c.userId, a.status ?? ["draft", "held", "scheduled"], 20);
    const busy = await drafts.isDrafting(c.userId);
    return data(`${list.length} draft(s)${busy ? "; still writing drafts from the latest check-in" : ""}.`, list.map((d) => ({ id: d.id, status: d.status, angle: d.why.angle, scheduledFor: d.scheduledFor, body: d.body })));
  }));

  server.registerTool("get_draft", {
    title: "Get a draft and why it reads that way",
    description: "One draft in full with its 'why': the angle, every check (passed, fixed, rewritten or held, with the reason), what was changed, the model and the cost.",
    inputSchema: z.object({ id: z.string().uuid() }), annotations: READ,
  }, tool("cadence:read", async (c, a: { id: string }) => data("Draft:", await drafts.getDraft(c.userId, a.id))));

  server.registerTool("get_results", {
    title: "Outreach and impact",
    description: "Posts per week against the target (outreach) and reach and engagement per post (impact), plus what works by angle, weekday and length. Impact is empty until LinkedIn grants analytics; demo data is marked sample.",
    inputSchema: z.object({ weeks: z.number().int().min(1).max(52).default(8) }), annotations: READ,
  }, tool("cadence:read", async (c, a: { weeks: number }) => {
    const [outreach, impact, works] = await Promise.all([stats.outreach(c.userId, a.weeks), stats.impact(c.userId), stats.whatWorks(c.userId)]);
    return data("Results:", { outreach, impact, whatWorks: works });
  }));

  server.registerTool("save_checkin", {
    title: "Save this week's check-in",
    description: "Save the user's notes about their week; Cadence then writes drafts in their voice (about a minute). Use the user's own words; don't invent facts. Then call list_drafts.",
    inputSchema: z.object({ notes: z.string().min(20).max(4000).describe("What the user worked on, learned, shipped or noticed, in their words") }), annotations: WRITE,
  }, tool("cadence:write", async (c, a: { notes: string }) => {
    await drafts.saveCheckin(c.userId, a.notes);
    return text("Saved. Cadence is writing drafts now; check back with list_drafts in about a minute.");
  }));

  server.registerTool("edit_draft", {
    title: "Edit a draft",
    description: "Replace a draft's text with the user's version. It is re-checked (never rewritten) and must be approved again.",
    inputSchema: z.object({ id: z.string().uuid(), body: z.string().min(10).max(3000) }), annotations: WRITE,
  }, tool("cadence:write", async (c, a: { id: string; body: string }) => data("Edited and re-checked:", await drafts.editDraft(c.userId, a.id, a.body))));

  server.registerTool("skip_draft", {
    title: "Skip a draft",
    description: "Drop a draft so it never posts.",
    inputSchema: z.object({ id: z.string().uuid() }), annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
  }, tool("cadence:write", async (c, a: { id: string }) => { await drafts.skipDraft(c.userId, a.id); return text("Skipped."); }));

  server.registerTool("approve_draft", {
    title: "Approve a draft to post",
    description: "Schedules the draft, exactly as written, to post on LinkedIn at the user's next posting slot. Before calling this, show the user the full text and get their explicit yes. Never approve on your own initiative.",
    inputSchema: z.object({ id: z.string().uuid() }), annotations: { ...WRITE, destructiveHint: true, openWorldHint: true },
  }, tool("cadence:approve", async (c, a: { id: string }) => {
    const d = await drafts.approveDraft(c.userId, a.id);
    return text(`Approved. It will post ${d.scheduledFor ? new Date(d.scheduledFor).toUTCString() : "at the next slot"}.`);
  }));

  server.registerPrompt("weekly_checkin", {
    title: "Weekly check-in",
    description: "A two-minute interview about the user's week, saved as their Cadence check-in.",
  }, () => ({
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: `Help me do my weekly Cadence check-in. Ask me three short questions, one at a time: what I worked on or shipped, something I learned or noticed, and a question someone asked me this week. Then summarise my answers in my own words (no invented facts or numbers), show me the summary, and after I confirm, call save_checkin with it. Then tell me drafts will be ready in about a minute. For context, Cadence has ${COUNTS.routines} automatic routines, including: ${ROUTINES.slice(0, 4).map((r) => r.name.toLowerCase()).join(", ")}.`,
      },
    }],
  }));
}
