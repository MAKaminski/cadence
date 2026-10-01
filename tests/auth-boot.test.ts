import { describe, expect, it } from "vitest";

// deploy/.env lists every setting, so the ones not filled in yet reach the server as "" rather than
// unset. The auth module must still load: on 2026-10-01 an empty STRIPE_SECRET_KEY made new Stripe("")
// throw at import, and every route behind sign-in answered 500. No database connection is made here.
describe("auth module on a server whose optional settings are empty", () => {
  it("loads, and builds its Stripe client, with the deploy/.env keys present but blank", async () => {
    const blank = [
      "LINKEDIN_ANALYTICS", "X_CLIENT_ID", "X_CLIENT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID", "STRIPE_ANNUAL_PRICE_ID", "ANTHROPIC_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "CADENCE_ADMINS",
    ];
    Object.assign(process.env, {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://unused@localhost/unused",
      BETTER_AUTH_URL: "https://cadence.example.com", BETTER_AUTH_SECRET: "x".repeat(40),
      LINKEDIN_CLIENT_ID: "preview", LINKEDIN_CLIENT_SECRET: "preview",
      ...Object.fromEntries(blank.map((k) => [k, ""])),
    });
    delete process.env.CADENCE_DEMO;
    const mod = await import("@/lib/auth");
    expect(mod.stripeClient).toBeDefined();
    expect(mod.emailSignIn()).toBe(false);
  });
});
