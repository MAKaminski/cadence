import { expect, test } from "./test";

test("channels: connect X in one click, get an X version of each draft, post it", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();

  // Channels: LinkedIn is connected from the trial; X is one click; the rest are coming soon.
  await page.getByRole("link", { name: "Channels" }).click();
  await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible();
  await expect(page.getByTestId("channel-linkedin")).toContainText("Connected");
  const x = page.getByTestId("channel-x");
  await x.getByRole("button", { name: "Connect X" }).click();
  await expect(x).toContainText("Connected");
  await expect(x.getByRole("switch", { name: "Draft for X" })).toBeChecked();
  for (const name of ["Instagram", "TikTok", "Pinterest", "Facebook"]) await expect(page.getByTestId("channels-planned")).toContainText(name);

  // A check-in now makes a LinkedIn draft and, right after it, its X version.
  await page.getByRole("link", { name: "This week" }).click();
  await page.getByRole("button", { name: /use example notes/i }).click();
  await page.getByRole("button", { name: "Save check-in" }).click();
  const xDraft = page.locator('[data-testid="draft"]').filter({ has: page.getByTestId("channel").getByText("X", { exact: true }) }).first();
  await expect(xDraft).toBeVisible();
  await xDraft.getByText("Why this draft").click();
  await expect(xDraft.getByTestId("why")).toContainText("Written for X from the LinkedIn draft");
  await expect(xDraft.getByTestId("why")).toContainText("X limit");

  // Approve and post the X version on its own.
  await xDraft.getByRole("button", { name: "Approve" }).click();
  const scheduled = page.locator('[data-testid="draft"][data-status="scheduled"]').filter({ has: page.getByTestId("channel").getByText("X", { exact: true }) });
  await expect(scheduled).toHaveCount(1);
  await scheduled.getByRole("button", { name: "Post now" }).click();
  await expect(scheduled).toHaveCount(0);
});
