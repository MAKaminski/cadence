CREATE TABLE "history_chunks" (
	"import_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"idx" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "history_chunks_import_id_idx_pk" PRIMARY KEY("import_id","idx")
);
--> statement-breakpoint
ALTER TABLE "history_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "history_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"file_name" text NOT NULL,
	"bytes" integer NOT NULL,
	"chunk_bytes" integer NOT NULL,
	"chunks" integer NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "history_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "history_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"import_id" uuid NOT NULL,
	"conversation" text,
	"sent_at" timestamp with time zone,
	"body" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "history_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "history_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"import_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"evidence" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "history_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "history_chunks" ADD CONSTRAINT "history_chunks_import_id_history_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."history_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_chunks" ADD CONSTRAINT "history_chunks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_imports" ADD CONSTRAINT "history_imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_messages" ADD CONSTRAINT "history_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_messages" ADD CONSTRAINT "history_messages_import_id_history_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."history_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_suggestions" ADD CONSTRAINT "history_suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_suggestions" ADD CONSTRAINT "history_suggestions_import_id_history_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."history_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_imports_user" ON "history_imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "history_messages_once" ON "history_messages" USING btree ("user_id","hash");--> statement-breakpoint
CREATE INDEX "history_messages_import" ON "history_messages" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "history_suggestions_import" ON "history_suggestions" USING btree ("import_id","kind");--> statement-breakpoint
CREATE POLICY "history_chunks_tenant" ON "history_chunks" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "history_imports_tenant" ON "history_imports" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "history_messages_tenant" ON "history_messages" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
CREATE POLICY "history_suggestions_tenant" ON "history_suggestions" AS PERMISSIVE FOR ALL TO "cadence_app" USING (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker') WITH CHECK (user_id = current_setting('app.user_id', true) or current_setting('app.role', true) = 'worker');--> statement-breakpoint
-- Like every tenant table (see 0001_rls_grants.sql), the unprivileged app role needs CRUD here.
GRANT SELECT, INSERT, UPDATE, DELETE ON history_imports, history_chunks, history_messages, history_suggestions TO cadence_app;
