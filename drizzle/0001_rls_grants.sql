-- The unprivileged role every user-scoped transaction switches to (SET LOCAL ROLE cadence_app).
-- Railway's login role is a superuser, which bypasses row-level security; this role does not.
GRANT USAGE ON SCHEMA public TO cadence_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_accounts, profiles, inputs, drafts, publications, metrics, jobs, llm_usage TO cadence_app;--> statement-breakpoint
GRANT SELECT ON "user" TO cadence_app;
