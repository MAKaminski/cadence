import { defineConfig, devices } from "@playwright/test";

// The demo smoke test: the whole trial path in demo mode, against a running `pnpm demo`
// (CI starts it; locally, run `pnpm demo` in another terminal first).
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:3000", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 },
    // Better Auth rate-limits sign-in and OAuth registration per client IP (3 sign-ins per 10 s, 5
    // registrations a minute). Each run gets its own simulated client IP so back-to-back runs don't
    // share a bucket; the limits themselves stay exactly as in production.
    extraHTTPHeaders: { "x-forwarded-for": `10.${(Date.now() >> 16) & 255}.${(Date.now() >> 8) & 255}.${Date.now() & 255}` },
  },
  reporter: [["list"]],
});
