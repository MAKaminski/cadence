import { sql } from "drizzle-orm";
import {
  boolean, index, integer, jsonb, numeric, pgEnum, pgPolicy, pgRole, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ---------------------------------------------------------------------------------------------
// Platforms. LinkedIn is the only one in code today; every platform-facing row still says which
// platform it belongs to, so adding one is a new enum value and a new adapter, not a data migration.
// Shared facts are columns; anything only one platform has goes in `platform_data`.
export const platform = pgEnum("platform", ["linkedin"]);

// Row-level security. The app's database login is a superuser on Railway, and superusers bypass RLS,
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
  status: text("status", { enum: ["draft", "approved", "scheduled", "publishing", "published", "skipped", "held", "failed"] }).notNull().default("draft"),
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
}, (t) => [index("metrics_publication").on(t.publicationId), tenant("metrics")]).enableRLS();

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  kind: text("kind", { enum: ["draft", "publish", "metrics", "remind_checkin", "remind_expiry"] }).notNull(),
  refId: uuid("ref_id"),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
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
