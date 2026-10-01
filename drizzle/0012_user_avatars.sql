CREATE TABLE "user_avatars" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_avatars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "user_avatars_tenant" ON "user_avatars" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
-- Like every tenant table (see 0001_rls_grants.sql), the unprivileged app role needs CRUD here.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_avatars TO cadence_app;
