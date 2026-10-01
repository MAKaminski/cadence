import { expect, test } from "./test";

test("inputs: every input in one place, edited there or on its home page, each seen in the other", async ({ page }) => {
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

  // The nav says what you do on each page; This week is where you act.
  await expect(page.getByTestId("page-kind")).toContainText("Act");
  await page.getByRole("link", { name: "Inputs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inputs", level: 1 })).toBeVisible();
  await expect(page.getByTestId("strategy")).toContainText(/Maintain|Increase|Decrease/);
  for (const id of ["role", "facts", "voiceSamples", "topics", "noGo", "checkin", "model", "postsPerWeek", "slots", "commentsPerDay", "pause", "autoPublish", "channels"])
    await expect(page.getByTestId(`input-${id}`)).toBeVisible();

  // Inputs → Plan: four comments a day, set here, show on Plan.
  const comments = page.getByTestId("input-commentsPerDay");
  await expect(comments).toContainText("On Plan");
  await comments.getByRole("spinbutton", { name: "Comments a day" }).fill("4");
  await comments.getByRole("button", { name: "Save" }).click();
  await expect(comments.getByRole("spinbutton", { name: "Comments a day" })).toHaveValue("4");
  await comments.getByRole("link", { name: /On Plan/ }).click();
  await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();
  await expect(page.getByTestId("comments").getByRole("spinbutton", { name: "Comments a day" })).toHaveValue("4");

  // Plan → Inputs: pausing on Plan shows on Inputs, with the direction to resume.
  await page.getByRole("switch", { name: "Pause posting" }).click();
  await expect(page.getByTestId("pause")).toContainText("Posting is paused");
  await page.getByTestId("all-inputs").click();
  await expect(page.getByRole("heading", { name: "Inputs", level: 1 })).toBeVisible();
  const pause = page.getByTestId("input-pause");
  await expect(pause.getByRole("switch", { name: "Pause posting" })).toBeChecked();
  await expect(pause.locator('[data-direction="increase"]')).toBeVisible();
  await pause.getByRole("switch", { name: "Pause posting" }).click();
  await expect(pause.getByRole("switch", { name: "Pause posting" })).not.toBeChecked();

  // Inputs → Setup: a topic added here is in setup's topics.
  const topics = page.getByTestId("input-topics");
  const field = topics.getByRole("textbox", { name: "Topics" });
  await field.fill(`${await field.inputValue()}\nPricing experiments`);
  await topics.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Topics saved.")).toBeVisible();
  await topics.getByRole("link", { name: /On Setup/ }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.locator("#topics")).toHaveValue(/Pricing experiments/);
});
