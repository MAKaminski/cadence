import { afterEach, describe, expect, it } from "vitest";
import { emailConfigured, missingSignInKeys, setupChecks, setupWarning } from "@/lib/setup-check";

const base = {
  DOMAIN: "cadence.example.com", BETTER_AUTH_URL: "https://cadence.example.com",
  BETTER_AUTH_SECRET: "x".repeat(40), LINKEDIN_CLIENT_ID: "changeme", LINKEDIN_CLIENT_SECRET: "super-secret-value",
};
const failing = (env: Record<string, string | undefined>) => setupChecks(env).filter((c) => !c.ok).map((c) => `${c.level}:${c.keys}`);

describe("sign-in setup check", () => {
  const saved = process.env.CADENCE_DEMO;
  afterEach(() => { process.env.CADENCE_DEMO = saved; });

  it("says nobody can sign in when LinkedIn is a placeholder and email is unset, naming both settings", () => {
    delete process.env.CADENCE_DEMO;
    expect(failing(base)).toEqual([
      "warn:LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET", "warn:RESEND_API_KEY, EMAIL_FROM", "error:Sign-in method",
      "warn:STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID",
    ]);
    expect(missingSignInKeys(base)).toEqual(["LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET", "RESEND_API_KEY, EMAIL_FROM"]);
  });

  it("email alone is a way in", () => {
    delete process.env.CADENCE_DEMO;
    const env = { ...base, RESEND_API_KEY: "re_123", EMAIL_FROM: "Cadence <hello@example.com>" };
    expect(emailConfigured(env)).toBe(true);
    expect(failing(env)).not.toContain("error:Sign-in method");
    expect(emailConfigured({ ...env, EMAIL_FROM: "Cadence" })).toBe(false);
  });

  it("catches a BETTER_AUTH_URL that isn't https or doesn't match DOMAIN, and a short secret", () => {
    delete process.env.CADENCE_DEMO;
    expect(failing({ ...base, BETTER_AUTH_URL: "http://cadence.example.com" })).toContain("error:BETTER_AUTH_URL");
    expect(failing({ ...base, BETTER_AUTH_URL: "https://www.cadence.example.com" })).toContain("error:BETTER_AUTH_URL");
    expect(failing({ ...base, BETTER_AUTH_URL: "https://cadence.example.com/" })).not.toContain("error:BETTER_AUTH_URL");
    expect(failing({ ...base, BETTER_AUTH_URL: undefined })).toContain("error:BETTER_AUTH_URL");
    expect(failing({ ...base, BETTER_AUTH_SECRET: "short" })).toContain("error:BETTER_AUTH_SECRET");
  });

  it("is quiet when everything is set, and never prints values", () => {
    delete process.env.CADENCE_DEMO;
    const all = {
      ...base, LINKEDIN_CLIENT_ID: "78abcd1efgh2ij", RESEND_API_KEY: "re_123", EMAIL_FROM: "hello@example.com",
      STRIPE_SECRET_KEY: "sk_live_1", STRIPE_WEBHOOK_SECRET: "whsec_1", STRIPE_PRICE_ID: "price_1",
    };
    expect(setupWarning(all)).toBeNull();
    const w = setupWarning(base)!;
    expect(w).toContain("LINKEDIN_CLIENT_ID");
    for (const secret of ["super-secret-value", "changeme", base.BETTER_AUTH_SECRET]) expect(w).not.toContain(secret);
  });
});
