CREATE TABLE "example_media" (
	"example_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "example_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"url" text,
	"title" text,
	"author" text,
	"body" text,
	"media_kind" text DEFAULT 'none' NOT NULL,
	"media_mime" text,
	"media_bytes" integer,
	"rating" text,
	"note" text,
	"analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"analysis_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "examples" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled_for_all" boolean DEFAULT false NOT NULL,
	"allow_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"action" text NOT NULL,
	"bytes" integer,
	"cost_usd" numeric(10, 6),
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "example_media" ADD CONSTRAINT "example_media_example_id_examples_id_fk" FOREIGN KEY ("example_id") REFERENCES "public"."examples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "example_media" ADD CONSTRAINT "example_media_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "examples_user" ON "examples" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_feature" ON "usage_events" USING btree ("feature","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_user" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "example_media_tenant" ON "example_media" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "examples_tenant" ON "examples" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "usage_events_tenant" ON "usage_events" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
-- Like every tenant table (see 0001_rls_grants.sql), the unprivileged app role needs CRUD here.
-- feature_flags is global and read with the server's own login, so the app role gets nothing on it.
GRANT SELECT, INSERT, UPDATE, DELETE ON examples, example_media, usage_events TO cadence_app;
