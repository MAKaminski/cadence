import { afterEach, describe, expect, it } from "vitest";
import { linkedinConfigured, linkedinIdLooksReal, linkedinWarning } from "@/lib/linkedin-config";

const env = (id?: string, secret?: string) => ({ LINKEDIN_CLIENT_ID: id, LINKEDIN_CLIENT_SECRET: secret, BETTER_AUTH_URL: "https://cadence.example.com" }) as unknown as NodeJS.ProcessEnv;

describe("LinkedIn configuration", () => {
  const saved = { demo: process.env.CADENCE_DEMO };
  afterEach(() => { process.env.CADENCE_DEMO = saved.demo; });

  it("rejects empty, placeholder and malformed client IDs", () => {
    for (const id of [undefined, "", "  ", "preview", "PREVIEW", "build", "ci", "test", "changeme", "short123", "has space 12345", "78abcd-1efgh2ij"]) {
      expect(linkedinIdLooksReal(id), String(id)).toBe(false);
    }
    expect(linkedinIdLooksReal("78abcd1efgh2ij")).toBe(true);
  });

  it("needs a real ID and a secret", () => {
    delete process.env.CADENCE_DEMO;
    expect(linkedinConfigured(env("preview", "secret"))).toBe(false);
    expect(linkedinConfigured(env("78abcd1efgh2ij", ""))).toBe(false);
    expect(linkedinConfigured(env("78abcd1efgh2ij", "build"))).toBe(false);
    expect(linkedinConfigured(env("78abcd1efgh2ij", "a-real-secret"))).toBe(true);
  });

  it("warns once with the redirect URL to register and never the values", () => {
    delete process.env.CADENCE_DEMO;
    const w = linkedinWarning(env("preview", "super-secret-value"));
    expect(w).toContain("https://cadence.example.com/api/auth/callback/linkedin");
    expect(w).not.toContain("super-secret-value");
    expect(w).not.toContain("preview");
    expect(linkedinWarning(env("78abcd1efgh2ij", "a-real-secret"))).toBeNull();
  });
});
