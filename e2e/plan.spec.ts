import { expect, test, type Page } from "@playwright/test";

async function signUpAndSetUp(page: Page) {
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
}

test("plan: raise posts a week, toggle a slot, plan comments, pause posting", async ({ page }) => {
  await signUpAndSetUp(page);
  await page.getByRole("link", { name: "Plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();

  // Setup's rhythm became slot A; one more a week shows what it would change before applying.
  const posting = page.getByTestId("posting");
  const before = Number(await posting.getByRole("spinbutton", { name: "Posts a week" }).inputValue());
  await posting.getByRole("button", { name: "One more posts a week" }).click();
  await expect(posting.getByRole("status")).toContainText(`to ${before + 1} a week: turns slot`);
  await posting.getByRole("button", { name: "Apply" }).click();
  await expect(posting.getByRole("spinbutton", { name: "Posts a week" })).toHaveValue(String(before + 1));

  // A cell is one slot on one day.
  const sun = posting.getByRole("button", { name: "Slot C on Sun" });
  await expect(sun).toHaveAttribute("aria-pressed", "false");
  await sun.click();
  await expect(sun).toHaveAttribute("aria-pressed", "true");
  await expect(posting.getByRole("spinbutton", { name: "Posts a week" })).toHaveValue(String(before + 2));

  // Comments: plan five a day; they appear on the timeline.
  const comments = page.getByTestId("comments");
  await comments.getByRole("spinbutton", { name: "Comments a day" }).fill("5");
  await expect(comments.getByRole("status")).toContainText("adds 5 at");
  await comments.getByRole("button", { name: "Apply" }).click();
  await expect(comments.getByRole("spinbutton", { name: "Comments a day" })).toHaveValue("5");
  await expect(page.getByTestId("timeline").getByRole("button", { name: /^Comment run at/ })).toHaveCount(5);

  // Pause and resume posting.
  await page.getByRole("switch", { name: "Pause posting" }).click();
  await expect(page.getByTestId("pause")).toContainText("Posting is paused");
  await page.getByRole("switch", { name: "Pause posting" }).click();
  await expect(page.getByTestId("pause")).toContainText("Posting is on");
});
