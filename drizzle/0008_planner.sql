CREATE TABLE "engine_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"volume" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "holds" (
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"reason" text,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holds_user_id_name_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"family" text NOT NULL,
	"slot" text,
	"local_time" text NOT NULL,
	"days" text DEFAULT '1111111' NOT NULL,
	"mode" text DEFAULT 'off' NOT NULL,
	"executor" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engine_settings" ADD CONSTRAINT "engine_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_key" ON "schedules" USING btree ("user_id","key");--> statement-breakpoint
CREATE POLICY "engine_settings_tenant" ON "engine_settings" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "holds_tenant" ON "holds" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "schedules_tenant" ON "schedules" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
-- Like every tenant table (see 0001_rls_grants.sql), the unprivileged app role needs CRUD here.
GRANT SELECT, INSERT, UPDATE, DELETE ON schedules, holds, engine_settings TO cadence_app;
