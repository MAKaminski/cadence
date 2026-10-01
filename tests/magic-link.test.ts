import { describe, expect, it } from "vitest";
import { MAGIC_LINK_MINUTES, confirmUrl, magicLinkEmail, safeNext, verifyHref } from "@/lib/magic-link";

describe("email sign-in links", () => {
  it("only ever lands on a same-site path", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext("/app/settings")).toBe("/app/settings");
    expect(safeNext("/login?sig=abc&client_id=x")).toBe("/login?sig=abc&client_id=x");
    expect(safeNext("https://evil.example/app")).toBe("/app");
    expect(safeNext("//evil.example/app")).toBe("/app");
    expect(safeNext("javascript:alert(1)")).toBe("/app");
    expect(safeNext("/")).toBe("/app");
    expect(safeNext("http://localhost:3000/onboarding", "http://localhost:3000")).toBe("/onboarding");
  });

  it("emails a confirm page, not the endpoint that spends the token", () => {
    const link = confirmUrl("https://cadence.example", "tok_123", "/app");
    expect(link).toBe("https://cadence.example/login/email?token=tok_123");
    expect(confirmUrl("https://cadence.example", "t", "/onboarding")).toContain("next=%2Fonboarding");
    const { subject, text } = magicLinkEmail(link);
    expect(subject).toMatch(/sign-in link/);
    expect(text).toContain(link);
    expect(text).toContain(`${MAGIC_LINK_MINUTES} minutes`);
  });

  it("the confirm button verifies and sends failures back to the login page", () => {
    const h = verifyHref("t o k", "/app/settings");
    const u = new URL(h, "https://cadence.example");
    expect(u.pathname).toBe("/api/auth/magic-link/verify");
    expect(u.searchParams.get("token")).toBe("t o k");
    expect(u.searchParams.get("callbackURL")).toBe("/app/settings");
    expect(u.searchParams.get("errorCallbackURL")).toBe("/login?error=link");
  });
});
