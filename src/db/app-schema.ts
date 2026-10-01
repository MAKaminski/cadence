import { sql } from "drizzle-orm";
import {
  boolean, customType, index, integer, jsonb, numeric, pgEnum, pgPolicy, pgRole, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ---------------------------------------------------------------------------------------------
// Platforms. Every channel in src/platforms/registry.ts has a value here, live or planned, so taking a
// planned channel live is a registry entry and an adapter, not a migration. Every platform-facing row
// says which platform it belongs to. Shared facts are columns; the rest goes in `platform_data`.
export const platform = pgEnum("platform", [
  "linkedin", "x", "threads", "bluesky", "mastodon", "facebook", "instagram", "pinterest", "tiktok", "youtube", "reddit", "google_business",
]);
/** Where a push token lives. iOS today; Android would be a new value and a new sender. */
export const devicePlatform = pgEnum("device_platform", ["ios"]);

// Row-level security. The app's database login is a superuser in production, and superusers bypass RLS,
// so every user-scoped transaction switches to this unprivileged role (see src/db/index.ts).
export const appRole = pgRole("cadence_app", { createRole: true, inherit: true });
const mine = sql`user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker'`;
const tenant = (name: string) => pgPolicy(`${name}_tenant`, { as: "permissive", for: "all", to: appRole, using: mine, withCheck: mine });

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const owner = () => text("user_id").notNull().references(() => user.id, { onDelete: "cascade" });

/** A connected social account. The OAuth token itself lives (encrypted) in Better Auth's `account`
 *  table — one source of truth — this row is the platform-level view: identity, status, expiry. */
export const platformAccounts = pgTable("platform_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  platform: platform("platform").notNull(),
  externalId: text("external_id").notNull(),            // LinkedIn person URN
  handle: text("handle"),
  status: text("status", { enum: ["active", "expiring", "expired", "revoked"] }).notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /** Make drafts for this channel. Off keeps the connection but stops new drafts for it. */
  drafting: boolean("drafting").notNull().default(true),
  platformData: jsonb("platform_data").notNull().default({}),
  createdAt: created(),
}, (t) => [uniqueIndex("platform_accounts_unique").on(t.userId, t.platform, t.externalId), tenant("platform_accounts")]).enableRLS();

/** What the user tells us once (and edits in Settings). */
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  about: jsonb("about").notNull().default({}),           // role, audience, goals
  facts: jsonb("facts").notNull().default([]),           // the only claims allowed in print
  voiceSamples: jsonb("voice_samples").notNull().default([]),
  topics: jsonb("topics").notNull().default([]),
  noGo: jsonb("no_go").notNull().default([]),
  cadence: jsonb("cadence").notNull().default({ perWeek: 3, days: ["Tue", "Wed", "Thu"], time: "09:00", tz: "America/New_York" }),
  model: text("model", { enum: ["claude-sonnet-5", "claude-opus-5"] }).notNull().default("claude-sonnet-5"),
  autoPublish: boolean("auto_publish").notNull().default(false),
  onboardingStep: integer("onboarding_step").notNull().default(1), // 4 = done
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, () => [tenant("profiles")]).enableRLS();

/** What the user tells us every week. */
export const inputs = pgTable("inputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  kind: text("kind", { enum: ["checkin", "link", "note"] }).notNull(),
  body: text("body").notNull(),
  createdAt: created(),
}, (t) => [index("inputs_user").on(t.userId, t.createdAt), tenant("inputs")]).enableRLS();

export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  platformAccountId: uuid("platform_account_id").references(() => platformAccounts.id, { onDelete: "set null" }),
  platform: platform("platform").notNull(),
  version: integer("version").notNull().default(1),
  body: text("body").notNull(),
  approvedBodyHash: text("approved_body_hash"),          // only this exact text may be published
  gate: jsonb("gate").notNull().default({}),
  // Publishing state lives only in `publications`; a draft goes scheduled -> published (or failed).
  status: text("status", { enum: ["draft", "scheduled", "published", "skipped", "held", "failed"] }).notNull().default("draft"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  inputIds: jsonb("input_ids").notNull().default([]),
  createdAt: created(),
}, (t) => [index("drafts_user_status").on(t.userId, t.status), tenant("drafts")]).enableRLS();

export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
  platform: platform("platform").notNull(),
  // 'publishing' is written BEFORE the platform call; a crash leaves it here for review, never retried.
  status: text("status", { enum: ["publishing", "published", "needs_review", "failed"] }).notNull(),
  externalPostId: text("external_post_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [uniqueIndex("publications_one_per_draft").on(t.draftId), uniqueIndex("publications_external").on(t.platform, t.externalPostId), tenant("publications")]).enableRLS();

export const metrics = pgTable("metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  publicationId: uuid("publication_id").notNull().references(() => publications.id, { onDelete: "cascade" }),
  platform: platform("platform").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  impressions: integer("impressions"),
  reactions: integer("reactions"),
  comments: integer("comments"),
  reshares: integer("reshares"),
  platformData: jsonb("platform_data").notNull().default({}),
}, (t) => [index("metrics_publication").on(t.publicationId), index("metrics_user_time").on(t.userId, t.capturedAt), tenant("metrics")]).enableRLS();

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  kind: text("kind", { enum: ["draft", "publish", "metrics", "remind_checkin", "remind_expiry", "analyze_example"] }).notNull(),
  refId: uuid("ref_id"),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  // Set when a worker claims the job. A 'running' job whose lock is older than the lease was lost with
  // its worker and is queued again — except publish jobs, which are never repeated (see src/worker).
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("jobs_due").on(t.status, t.runAt), uniqueIndex("jobs_once").on(t.userId, t.kind, t.refId, t.runAt), tenant("jobs")]).enableRLS();

/** Every model call, so the monthly cap is enforced and the margin is measured, not estimated. */
export const llmUsage = pgTable("llm_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  tokensIn: integer("tokens_in").notNull(),
  tokensOut: integer("tokens_out").notNull(),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
  createdAt: created(),
}, (t) => [index("llm_usage_user_month").on(t.userId, t.createdAt), tenant("llm_usage")]).enableRLS();

/** Push notification targets (APNs device tokens from the iOS app). Deleted when APNs says the token is gone. */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  platform: devicePlatform("platform").notNull(),
  token: text("token").notNull(),
  environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
  createdAt: created(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("devices_token").on(t.token), index("devices_user").on(t.userId), tenant("devices")]).enableRLS();

// ---------------------------------------------------------------------------------------------
// The planner. Every recurring job a user runs is a schedule row: a time, the days it runs and a mode.
// Posting rows (`posting:A`..`posting:C`) are the slots approved posts go into, run by this server.
// Comment, outreach and job-search rows are run by the optional Cadence runner on the user's own
// machine; until one is connected they are plans only. "How many" is a count the planner turns into
// rows (src/engine/plan.ts); "when" is the row's time.

/** One recurring job. `days` is a Mon..Sun mask ("1111100" = weekdays). */
export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  key: text("key").notNull(),                            // posting:A, engage:03, ...
  family: text("family", { enum: ["posting", "engage", "outreach", "jobs"] }).notNull(),
  slot: text("slot"),                                    // A/B/C for posting rows
  localTime: text("local_time").notNull(),               // HH:MM in the user's zone
  days: text("days").notNull().default("1111111"),
  mode: text("mode", { enum: ["off", "shadow", "live"] }).notNull().default("off"),
  executor: text("executor", { enum: ["hosted", "runner"] }).notNull(),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("schedules_key").on(t.userId, t.key), tenant("schedules")]).enableRLS();

/** A pause. `all` stops publishing and every runner job; the others stop one family. */
export const holds = pgTable("holds", {
  userId: owner(),
  name: text("name", { enum: ["all", "engage", "outreach", "jobs"] }).notNull(),
  reason: text("reason"),
  setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.name] }), tenant("holds")]).enableRLS();

/** Planner preferences: the comment window and spacing, and the order posting slots fill in. */
export const engineSettings = pgTable("engine_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  volume: jsonb("volume").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, () => [tenant("engine_settings")]).enableRLS();

// ---------------------------------------------------------------------------------------------
// Examples: posts and visuals the user points at (a URL) or uploads (5 MB at most), rated thumbs up or
// down. Each is analysed once for its structure (hook, format, visual, close), and the rated analyses
// steer drafting: copy what's rated up, avoid what's rated down. Behind the `examples` feature flag.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const examples = pgTable("examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  source: text("source", { enum: ["url", "upload"] }).notNull(),
  url: text("url"),
  title: text("title"),
  author: text("author"),
  body: text("body"),                                    // the post text, if any (capped)
  mediaKind: text("media_kind", { enum: ["none", "image", "gif", "video", "pdf", "other"] }).notNull().default("none"),
  mediaMime: text("media_mime"),
  mediaBytes: integer("media_bytes"),
  rating: text("rating", { enum: ["up", "down"] }),
  note: text("note"),
  analysis: jsonb("analysis").notNull().default({}),
  analysisStatus: text("analysis_status", { enum: ["pending", "done", "failed", "skipped"] }).notNull().default("pending"),
  analysisError: text("analysis_error"),
  createdAt: created(),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
}, (t) => [index("examples_user").on(t.userId, t.createdAt), tenant("examples")]).enableRLS();

/** The file itself, apart from the row so listing examples never loads megabytes. */
export const exampleMedia = pgTable("example_media", {
  exampleId: uuid("example_id").primaryKey().references(() => examples.id, { onDelete: "cascade" }),
  userId: owner(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  data: bytea("data").notNull(),
}, () => [tenant("example_media")]).enableRLS();

/** Feature flags. Global, so no user_id: read and changed by the server and `pnpm flag`, never by a user. */
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabledForAll: boolean("enabled_for_all").notNull().default(false),
  allowEmails: jsonb("allow_emails").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What people do with a feature, for the usage page: one row per action, with bytes and model cost. */
export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  feature: text("feature").notNull(),
  action: text("action").notNull(),
  bytes: integer("bytes"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
  meta: jsonb("meta").notNull().default({}),
  createdAt: created(),
}, (t) => [index("usage_events_feature").on(t.feature, t.createdAt), index("usage_events_user").on(t.userId, t.createdAt), tenant("usage_events")]).enableRLS();
