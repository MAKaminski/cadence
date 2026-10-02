import { expect, test } from "./test";
import { engineExport } from "../tests/fixtures/engine-export";

// A LinkedIn Engine export uploaded on Import shows up on Results (all time): totals, the best post and the
// engine's own breakdowns (hook, rubric score), and on Published as posts from LinkedIn Engine.
test("engine import: history from LinkedIn Engine fills Results and Published", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  for (const step of [1, 2]) {
    await expect(page.getByText(`Step ${step} of 3`)).toBeVisible();
    await page.getByRole("button", { name: /fill in the example answers/i }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
  }
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();

  const ENGINE_EXPORT = engineExport();
  await page.goto("/app/import");
  const card = page.getByTestId("engine-import");
  await card.getByLabel("LinkedIn Engine export (.json)").setInputFiles({ name: "linkedin-engine-export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(ENGINE_EXPORT)) });
  await expect(card.getByTestId("engine-import-result")).toContainText("3 posts added, 4 sets of numbers, 1 skipped.");
  // Again: nothing new.
  await card.getByLabel("LinkedIn Engine export (.json)").setInputFiles({ name: "linkedin-engine-export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(ENGINE_EXPORT)) });
  await expect(card.getByTestId("engine-import-result")).toContainText("0 posts added, 3 already here, 0 sets of numbers");

  await card.getByRole("link", { name: "See them on Results" }).click();
  await expect(page.getByTestId("ranges").getByRole("link", { name: "All time" })).toHaveAttribute("aria-current", "page");
  const totals = page.getByTestId("totals");
  await expect(totals).toContainText("14,199"); // 940 + 12,959 + 300 impressions
  await expect(totals).toContainText("12,959");
  const works = page.getByTestId("chart-what-works");
  for (const g of ["By hook", "By rubric score", "By time of day"]) await expect(works.getByText(g, { exact: true })).toBeVisible();

  await page.goto("/app/published");
  await expect(page.getByText("From LinkedIn Engine").first()).toBeVisible();
  await expect(page.getByText("The text of this post wasn't kept by LinkedIn Engine.")).toBeVisible();
});
