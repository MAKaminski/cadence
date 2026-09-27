-- API keys belong to users. The plugin schema has no foreign key (it can also issue organisation keys,
-- which Cadence doesn't use), so add one: deleting a user deletes their keys.
DELETE FROM "apikey" WHERE "reference_id" NOT IN (SELECT "id" FROM "user");--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "api_key_owner_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."user"("id") ON DELETE cascade;
