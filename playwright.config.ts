import { defineConfig, devices } from "@playwright/test";

// The demo smoke test: the whole trial path in demo mode, against a running `pnpm demo`
// (CI starts it; locally, run `pnpm demo` in another terminal first).
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
  reporter: [["list"]],
});
