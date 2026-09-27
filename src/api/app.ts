// The public API, /api/v1. Routes are declared with @hono/zod-openapi, so the OpenAPI document at
// /api/v1/openapi.json is generated from the same schemas that validate requests. Every route calls
// src/services: the same rules as the web app and the MCP server.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { auth, API_LIMIT } from "@/lib/auth";
import { hasSubscription, me } from "@/services/account";
import { getProfile, patchProfile, profilePatch } from "@/services/profile";
import * as drafts from "@/services/drafts";
import * as stats from "@/services/stats";
import { ServiceError, STATUS } from "@/services/errors";
import { listPublications } from "@/services/publications";

export const SCOPES = ["read", "write", "approve"] as const;
export type Scope = (typeof SCOPES)[number];
type Env = { Variables: { userId: string; scopes: Scope[] } };

export const DISCLAIMER = [
  "Cadence is not affiliated with, endorsed by or sponsored by LinkedIn.",
  "You are responsible for everything published from your account. Drafts are written by AI and can be wrong; approving a draft is your review of it.",
  "The API cannot comment, message, send connection requests or act on LinkedIn beyond publishing posts you approved, on your schedule.",
  "Approving drafts needs a key with the separate `approve` scope, which only you can grant, in Settings.",
  "Rate limits and endpoints may change with 30 days' notice in the changelog. Keys used abusively are revoked.",
].join(" ");

// RFC 9457 problem details.
const Problem = z.object({ type: z.string(), title: z.string(), status: z.number(), detail: z.string() }).openapi("Problem");
function problem(c: Context, status: number, title: string, detail: string, headers: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(headers)) c.header(k, v);
  return c.json({ type: `https://github.com/MAKaminski/cadence/blob/main/docs/API.md#${title.toLowerCase().replace(/\W+/g, "-")}`, title, status, detail }, status as 400, { "content-type": "application/problem+json" });
}

const bearer = (c: Context) => c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

/** API key -> user, scopes and rate limit. The limiter is the api-key plugin's; we add the headers. */
const authenticate: MiddlewareHandler<Env> = async (c, next) => {
  const key = bearer(c);
  if (!key) return problem(c, 401, "Unauthorized", "Send your API key as `Authorization: Bearer cad_…`. Create one in Settings → API keys.");
  const r = await auth.api.verifyApiKey({ body: { key } });
  if (!r.valid || !r.key) {
    const code = (r.error as { code?: string } | null)?.code;
    if (code === "RATE_LIMITED") {
      const ms = Number((r.error as { details?: { tryAgainIn?: number } }).details?.tryAgainIn ?? API_LIMIT.windowMs);
      const secs = String(Math.max(1, Math.ceil(ms / 1000)));
      return problem(c, 429, "Too many requests", `This key allows ${API_LIMIT.max} requests per minute.`, {
        "Retry-After": secs, "RateLimit-Limit": String(API_LIMIT.max), "RateLimit-Remaining": "0", "RateLimit-Reset": secs,
      });
    }
    return problem(c, 401, "Unauthorized", "That API key is invalid, expired or revoked.");
  }
  const k = r.key;
  const max = k.rateLimitMax ?? API_LIMIT.max;
  c.header("RateLimit-Limit", String(max));
  c.header("RateLimit-Remaining", String(Math.max(0, max - (k.requestCount ?? 0))));
  c.header("RateLimit-Reset", String(Math.ceil((k.rateLimitTimeWindow ?? API_LIMIT.windowMs) / 1000)));
  const userId = k.referenceId;
  if (!(await hasSubscription(userId))) return problem(c, 402, "Subscription required", "This account has no active trial or subscription. Renew in Settings → Billing.");
  const perms = (k.permissions ?? {}) as Record<string, string[]>;
  c.set("userId", userId);
  c.set("scopes", (perms.cadence ?? ["read"]).filter((s): s is Scope => (SCOPES as readonly string[]).includes(s)));
  await next();
};

const need = (scope: Scope): MiddlewareHandler<Env> => async (c, next) => {
  if (!c.get("scopes").includes(scope)) return problem(c, 403, "Missing scope", `This key doesn't have the \`${scope}\` scope. Create a key with it in Settings → API keys.`);
  await next();
};

// ---------------------------------------------------------------------------------------------
// Schemas

const Check = z.object({ id: z.string(), label: z.string(), outcome: z.enum(["pass", "fixed", "rewrite", "held"]), detail: z.string().optional() });
const Why = z.object({
  angle: z.string(), why: z.string(), checks: z.array(Check), adjustments: z.array(z.string()), verdict: z.enum(["ok", "held"]),
  rewritten: z.boolean(), model: z.string(), costUsd: z.number(), variantsConsidered: z.number(),
}).openapi("Why", { description: "Why the draft reads the way it does: the angle, every check and what changed." });
const Draft = z.object({
  id: z.string().uuid(), status: z.enum(drafts.DRAFT_STATUSES), version: z.number().int(), body: z.string(),
  scheduledFor: z.string().datetime().nullable(), createdAt: z.string().datetime(), why: Why,
}).openapi("Draft");
const Me = z.object({
  id: z.string(), name: z.string(), email: z.string().nullable(),
  subscription: z.object({ status: z.string(), trialEnd: z.string().nullable(), periodEnd: z.string().nullable() }).nullable(),
  setupComplete: z.boolean(), model: z.string().nullable(), modelUseThisMonthUsd: z.number(), modelAllowanceUsd: z.number(),
  linkedin: z.object({ status: z.string(), expiresAt: z.string().nullable() }).nullable(),
  scopes: z.array(z.enum(SCOPES)),
}).openapi("Me");
const Profile = z.object({
  role: z.string(), audience: z.string(), goals: z.string(), facts: z.array(z.string()), voiceSamples: z.array(z.string()),
  topics: z.array(z.string()), noGo: z.array(z.string()),
  cadence: z.object({ perWeek: z.number(), days: z.array(z.string()), time: z.string(), tz: z.string() }),
  model: z.string(), autoPublish: z.boolean(), setupComplete: z.boolean(),
}).openapi("Profile");
const Publication = z.object({
  id: z.string().uuid(), draftId: z.string().uuid(), status: z.enum(["publishing", "published", "needs_review", "failed"]),
  url: z.string().nullable(), publishedAt: z.string().nullable(), body: z.string(),
  latest: z.object({ impressions: z.number().nullable(), reactions: z.number().nullable(), comments: z.number().nullable(), reshares: z.number().nullable(), sample: z.boolean() }).nullable(),
}).openapi("Publication");
const Outreach = z.array(z.object({ week: z.string(), posts: z.number(), target: z.number() })).openapi("Outreach");
const Impact = z.object({
  posts: z.array(z.object({ publicationId: z.string(), publishedAt: z.string(), excerpt: z.string(), impressions: z.number(), engagements: z.number(), rate: z.number(), movingRate: z.number(), sample: z.boolean() })),
  whatWorks: z.array(z.object({ dimension: z.enum(["angle", "weekday", "length"]), label: z.string(), posts: z.number(), rate: z.number() })),
}).openapi("Impact");
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

const errors = {
  401: { description: "Missing or invalid API key", content: { "application/problem+json": { schema: Problem } } },
  402: { description: "No active trial or subscription", content: { "application/problem+json": { schema: Problem } } },
  403: { description: "The key lacks the scope this needs", content: { "application/problem+json": { schema: Problem } } },
  429: { description: "Rate limited. See `Retry-After`", content: { "application/problem+json": { schema: Problem } } },
};
const json = <T extends z.ZodType>(schema: T, description: string) => ({ 200: { description, content: { "application/json": { schema } } }, ...errors });

// ---------------------------------------------------------------------------------------------
// Routes

export const api = new OpenAPIHono<Env>({
  defaultHook: (result, c) => {
    if (!result.success) return problem(c, 422, "Invalid request", result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  },
}).basePath("/api/v1");

api.onError((e, c) => {
  if (e instanceof ServiceError) return problem(c, STATUS[e.code], e.code.replace("_", " ").replace(/^./, (x) => x.toUpperCase()), e.message);
  console.error("[api]", e);
  return problem(c, 500, "Server error", "Something went wrong on our side. Try again shortly.");
});

api.openAPIRegistry.registerComponent("securitySchemes", "apiKey", { type: "http", scheme: "bearer", bearerFormat: "cad_…", description: "An API key from Settings → API keys." });
api.use("/me", authenticate); api.use("/profile", authenticate); api.use("/checkins", authenticate);
api.use("/drafts", authenticate); api.use("/drafts/*", authenticate); api.use("/publications", authenticate); api.use("/stats/*", authenticate);

const sec = [{ apiKey: [] }];

api.openapi(createRoute({ method: "get", path: "/me", tags: ["Account"], summary: "Your account, plan and connection", security: sec, middleware: [need("read")] as const, responses: json(Me, "Your account") }),
  async (c) => c.json({ ...(await me(c.get("userId"))), scopes: c.get("scopes") }, 200));

api.openapi(createRoute({ method: "get", path: "/profile", tags: ["Setup"], summary: "Your one-time setup", security: sec, middleware: [need("read")] as const, responses: json(Profile, "Your setup") }),
  async (c) => {
    const p = await getProfile(c.get("userId"));
    if (!p) throw new ServiceError("not_found", "Finish setup in the app first.");
    return c.json(p, 200);
  });

api.openapi(createRoute({
  method: "patch", path: "/profile", tags: ["Setup"], summary: "Change part of your setup",
  description: "Any subset of fields. `facts` is the only source of claims Cadence may make about you.",
  security: sec, middleware: [need("write")] as const,
  request: { body: { content: { "application/json": { schema: profilePatch } }, required: true } },
  responses: json(Profile, "Updated setup"),
}), async (c) => c.json((await patchProfile(c.get("userId"), c.req.valid("json")))!, 200));

api.openapi(createRoute({
  method: "post", path: "/checkins", tags: ["Weekly"], summary: "Save a check-in (starts drafting)",
  description: `Rough notes about your week. Drafting starts right away; poll \`GET /drafts?status=draft,held\`. Limited to ${drafts.CHECKINS_PER_DAY} a day, and model use is capped at the monthly allowance.`,
  security: sec, middleware: [need("write")] as const,
  request: { body: { content: { "application/json": { schema: z.object({ body: z.string().min(20).max(4000) }).openapi("CheckinInput") } }, required: true } },
  responses: { 202: { description: "Saved; drafting has started", content: { "application/json": { schema: z.object({ id: z.string().uuid() }) } } }, ...errors },
}), async (c) => c.json(await drafts.saveCheckin(c.get("userId"), c.req.valid("json").body), 202));

api.openapi(createRoute({
  method: "get", path: "/drafts", tags: ["Weekly"], summary: "List drafts", security: sec, middleware: [need("read")] as const,
  request: { query: z.object({
    status: z.string().optional().openapi({ description: `Comma-separated: ${drafts.DRAFT_STATUSES.join(", ")}`, example: "draft,held" }),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }) },
  responses: json(z.object({ drafts: z.array(Draft), drafting: z.boolean() }), "Drafts, newest first. `drafting` is true while a check-in is still being written up."),
}), async (c) => {
  const q = c.req.valid("query");
  const status = q.status?.split(",").map((s) => s.trim()).filter((s): s is drafts.DraftOut["status"] => (drafts.DRAFT_STATUSES as readonly string[]).includes(s));
  const userId = c.get("userId");
  return c.json({ drafts: await drafts.listDrafts(userId, status, q.limit), drafting: await drafts.isDrafting(userId) }, 200);
});

api.openapi(createRoute({ method: "get", path: "/drafts/{id}", tags: ["Weekly"], summary: "One draft, with why it reads the way it does", security: sec, middleware: [need("read")] as const, request: { params: IdParam }, responses: json(Draft, "The draft") }),
  async (c) => c.json(await drafts.getDraft(c.get("userId"), c.req.valid("param").id), 200));

api.openapi(createRoute({
  method: "patch", path: "/drafts/{id}", tags: ["Weekly"], summary: "Edit a draft",
  description: "Your text is re-checked but never rewritten. An edited draft must be approved again.",
  security: sec, middleware: [need("write")] as const,
  request: { params: IdParam, body: { content: { "application/json": { schema: z.object({ body: z.string().min(10).max(3000) }).openapi("EditInput") } }, required: true } },
  responses: json(Draft, "The edited draft"),
}), async (c) => c.json(await drafts.editDraft(c.get("userId"), c.req.valid("param").id, c.req.valid("json").body), 200));

api.openapi(createRoute({
  method: "post", path: "/drafts/{id}/approve", tags: ["Weekly"], summary: "Approve a draft (needs the approve scope)",
  description: "Locks the exact text and schedules it into your next posting slot. Only the approved text can be published, once. Requires a key with the `approve` scope, granted by you in Settings.",
  security: sec, middleware: [need("approve")] as const, request: { params: IdParam }, responses: json(Draft, "Scheduled draft"),
}), async (c) => c.json(await drafts.approveDraft(c.get("userId"), c.req.valid("param").id), 200));

api.openapi(createRoute({ method: "post", path: "/drafts/{id}/skip", tags: ["Weekly"], summary: "Skip a draft", security: sec, middleware: [need("write")] as const, request: { params: IdParam }, responses: json(Draft, "Skipped draft") }),
  async (c) => c.json(await drafts.skipDraft(c.get("userId"), c.req.valid("param").id), 200));

api.openapi(createRoute({ method: "get", path: "/publications", tags: ["Results"], summary: "What has been posted, with latest numbers", security: sec, middleware: [need("read")] as const, responses: json(z.object({ publications: z.array(Publication) }), "Publications, newest first") }),
  async (c) => c.json({ publications: await listPublications(c.get("userId")) }, 200));

api.openapi(createRoute({
  method: "get", path: "/stats/outreach", tags: ["Results"], summary: "Posts per week vs your target", security: sec, middleware: [need("read")] as const,
  request: { query: z.object({ weeks: z.coerce.number().int().min(1).max(52).default(12) }) }, responses: json(Outreach, "One row per week, oldest first"),
}), async (c) => c.json(await stats.outreach(c.get("userId"), c.req.valid("query").weeks), 200));

api.openapi(createRoute({
  method: "get", path: "/stats/impact", tags: ["Results"], summary: "Reach and engagement per post, and what works",
  description: "Empty until LinkedIn grants analytics access (demo mode returns labelled sample numbers).",
  security: sec, middleware: [need("read")] as const, responses: json(Impact, "Per-post impact and grouped engagement"),
}), async (c) => {
  const userId = c.get("userId");
  return c.json({ posts: await stats.impact(userId), whatWorks: await stats.whatWorks(userId) }, 200);
});

api.doc31("/openapi.json", (c) => ({
  openapi: "3.1.0",
  info: {
    title: "Cadence API", version: "1.0.0",
    description: `Drive Cadence from scripts, the CLI or your own tools: save check-ins, read and edit drafts, and read results.\n\n**Limits:** ${API_LIMIT.max} requests per minute per key (\`RateLimit-*\` headers on every response, \`Retry-After\` on 429), ${drafts.CHECKINS_PER_DAY} check-ins a day, and model use capped by your plan.\n\n**Scopes:** \`read\`, \`write\` (check-ins, edits, skips, setup) and \`approve\`, which you grant separately. There is no endpoint that publishes immediately; approved posts go out on your schedule.\n\n**Disclaimer:** ${DISCLAIMER}`,
    contact: { name: "Cadence", url: "https://github.com/MAKaminski/cadence" },
    license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    "x-disclaimer": DISCLAIMER,
  },
  servers: [{ url: new URL(c.req.url).origin, description: "This server" }],
  security: [{ apiKey: [] }],
  tags: [
    { name: "Account" }, { name: "Setup", description: "What you told Cadence once" },
    { name: "Weekly", description: "Check-ins and drafts" }, { name: "Results", description: "What was posted and how it did" },
  ],
}));
