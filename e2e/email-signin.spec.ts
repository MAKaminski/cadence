import { readFileSync } from "node:fs";
import { expect, test } from "./test";

// Email sign-up against a running demo whose output goes to demo.log (as CI starts it): demo mode
// prints emails instead of sending them, so the link is read back from that log.
const LOG = process.env.DEMO_LOG ?? "demo.log";

function linkFor(email: string): string | null {
  let log = "";
  try { log = readFileSync(LOG, "utf8"); } catch { return null; }
  const at = log.lastIndexOf(`[email] to=${email}`);
  if (at < 0) return null;
  return log.slice(at).match(/https?:\/\/\S+\/login\/email\?\S+/)?.[0] ?? null;
}

test("email: sign up with a link, start the trial, land in setup", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByTestId("email-sent")).toContainText(email);

  let link: string | null = null;
  await expect(async () => { link = linkFor(email); expect(link).toBeTruthy(); }).toPass({ timeout: 15_000 });
  await page.goto(link!);
  await expect(page.getByText("Finish signing in")).toBeVisible();
  await page.getByTestId("finish-sign-in").click();

  // A new account goes to the trial step, then setup.
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();

  // The same link never works twice.
  await page.context().clearCookies();
  await page.goto(link!);
  await page.getByTestId("finish-sign-in").click();
  await expect(page.getByText("That sign-in link has expired or was already used")).toBeVisible();
});
