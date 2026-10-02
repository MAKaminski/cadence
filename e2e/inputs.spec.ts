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
  // One tab per group: each tab shows only its own inputs.
  const tabs = page.getByTestId("input-tabs");
  const groups: [string, string[]][] = [
    ["Who you are", ["role", "facts"]], ["How you sound", ["voiceSamples", "topics", "noGo"]], ["What drafts learn from", ["checkin", "model"]],
    ["How much and when", ["postsPerWeek", "slots", "commentsPerDay", "pause"]], ["Where it goes", ["autoPublish", "channels"]],
  ];
  for (const [tab, ids] of groups) {
    await tabs.getByRole("link", { name: tab }).click();
    await expect(tabs.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    for (const id of ids) await expect(page.getByTestId(`input-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("input-role")).toHaveCount(0); // not on this tab

  await tabs.getByRole("link", { name: "How much and when" }).click();

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
  await expect(page).toHaveURL(/\/app\/inputs\?tab=rhythm$/); // Plan's inputs are on this tab
  const pause = page.getByTestId("input-pause");
  await expect(pause.getByRole("switch", { name: "Pause posting" })).toBeChecked();
  await expect(pause.locator('[data-direction="increase"]')).toBeVisible();
  await pause.getByRole("switch", { name: "Pause posting" }).click();
  await expect(pause.getByRole("switch", { name: "Pause posting" })).not.toBeChecked();

  // Inputs → Setup: a topic added here is in setup's topics.
  await tabs.getByRole("link", { name: "How you sound" }).click();
  const topics = page.getByTestId("input-topics");
  const field = topics.getByRole("textbox", { name: "Topics" });
  await field.fill(`${await field.inputValue()}\nPricing experiments`);
  await topics.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Topics saved.")).toBeVisible();
  await topics.getByRole("link", { name: /On Setup/ }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.getByTestId("picks-topics").getByRole("button", { name: "Pricing experiments" })).toHaveAttribute("aria-pressed", "true");
});

test("inputs: the demo's sample histories turn the directions", async ({ page }) => {
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

  // Overstretched: the strategy and posts a week say decrease; pause says resume.
  await page.goto("/app/inputs");
  await page.getByTestId("seed-history").getByRole("button", { name: "Overstretched" }).click();
  await expect(page.getByTestId("strategy").locator('[data-direction="decrease"]')).toBeVisible();
  const tabs = page.getByTestId("input-tabs");
  await expect(tabs.getByRole("link", { name: /How much and when/ }).getByLabel(/to change/)).toBeVisible(); // the tab says where to look
  await tabs.getByRole("link", { name: /How much and when/ }).click();
  await expect(page.getByTestId("input-postsPerWeek").locator('[data-direction="decrease"]')).toBeVisible();
  await expect(page.getByTestId("input-pause").locator('[data-direction="increase"]')).toBeVisible();
  await tabs.getByRole("link", { name: /What drafts learn from/ }).click();
  await expect(page.getByTestId("input-model").locator('[data-direction="decrease"]')).toBeVisible();
  await expect(page.getByTestId("seed-history")).toHaveCount(0); // offered only while there's no history
});
