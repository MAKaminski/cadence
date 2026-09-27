CREATE TYPE "public"."platform" AS ENUM('linkedin');--> statement-breakpoint
CREATE ROLE "cadence_app" WITH CREATEROLE;--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"ended_at" timestamp,
	"seats" integer,
	"billing_interval" text,
	"stripe_schedule_id" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"stripe_customer_id" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform_account_id" uuid,
	"platform" "platform" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" text NOT NULL,
	"approved_body_hash" text,
	"gate" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"input_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid,
	"run_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid,
	"model" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"publication_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"impressions" integer,
	"reactions" integer,
	"comments" integer,
	"reshares" integer,
	"platform_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"handle" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"platform_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"about" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice_samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"no_go" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cadence" jsonb DEFAULT '{"perWeek":3,"days":["Tue","Wed","Thu"],"time":"09:00","tz":"America/New_York"}'::jsonb NOT NULL,
	"model" text DEFAULT 'claude-sonnet-5' NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"status" text NOT NULL,
	"external_post_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "drafts_user_status" ON "drafts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "inputs_user" ON "inputs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_due" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_once" ON "jobs" USING btree ("user_id","kind","ref_id","run_at");--> statement-breakpoint
CREATE INDEX "llm_usage_user_month" ON "llm_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "metrics_publication" ON "metrics" USING btree ("publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_unique" ON "platform_accounts" USING btree ("user_id","platform","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_one_per_draft" ON "publications" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_external" ON "publications" USING btree ("platform","external_post_id");--> statement-breakpoint
CREATE POLICY "drafts_tenant" ON "drafts" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "inputs_tenant" ON "inputs" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "jobs_tenant" ON "jobs" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "llm_usage_tenant" ON "llm_usage" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "metrics_tenant" ON "metrics" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "platform_accounts_tenant" ON "platform_accounts" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "profiles_tenant" ON "profiles" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "publications_tenant" ON "publications" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');