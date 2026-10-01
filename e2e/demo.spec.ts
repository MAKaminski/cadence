import { expect, test } from "./test";

test("demo: sign up, trial, set up, check in, approve, publish", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /start|try|sign in/i }).first().click();
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();

  // Onboarding: example answers for steps 1 and 2, defaults for step 3.
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible(); // wait for the step to change before filling
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await page.getByRole("button", { name: /use example notes/i }).click();
  await page.getByRole("button", { name: "Save check-in" }).click();

  const first = page.getByTestId("draft").first();
  await expect(first).toBeVisible();
  await first.getByText("Why this draft").click();
  await expect(first.getByTestId("why")).toContainText("Fact check");

  const ready = page.locator('[data-testid="draft"][data-status="draft"]').first();
  await ready.getByRole("button", { name: "Approve" }).click();
  const scheduled = page.locator('[data-testid="draft"][data-status="scheduled"]').first();
  await expect(scheduled).toBeVisible();
  await scheduled.getByRole("button", { name: "Post now" }).click();

  await expect(scheduled).toHaveCount(0); // it leaves the list once it's posted
  await expect(async () => {
    await page.goto("/app/published");
    await expect(page.getByTestId("publication").first()).toContainText("Published", { timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  // Results: sample metrics arrive from the worker within seconds; history makes the trends visible.
  await page.goto("/app/results");
  await page.getByRole("button", { name: /sample history/i }).click();
  await expect(page.getByTestId("chart-outreach")).toBeVisible();
  await expect(page.getByTestId("chart-impact")).toBeVisible();
  await expect(page.getByTestId("chart-what-works")).toBeVisible();
  await expect(page.getByText("Demo: sample numbers")).toBeVisible();
});
