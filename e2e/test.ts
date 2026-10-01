// Every spec imports `test` from here. Better Auth rate-limits sign-in per client IP (3 per 10 s), and
// each spec signs up a fresh demo user, so each test gets its own simulated client IP. The limits
// themselves stay exactly as in production.
import { test as base } from "@playwright/test";
import { createHash } from "node:crypto";

export const test = base.extend({
  extraHTTPHeaders: async ({}, provide, info) => {
    const h = createHash("sha256").update(`${info.testId}:${Date.now()}`).digest();
    await provide({ "x-forwarded-for": `10.${h[0]}.${h[1]}.${h[2]}` });
  },
});
export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
