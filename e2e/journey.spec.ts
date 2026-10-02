import { expect, test } from "./test";
import { SAMPLE_CHATGPT } from "../src/lib/history-samples";
import { makeZip } from "../tests/fixtures/zip";

// One person through every feature, in the order a new user meets them, so the features are checked
// together rather than each on a fresh account: what one adds (an imported fact, a connected channel, a
// rated example) has to show up in the others (Inputs, drafting, Results, Admin usage).
const CHATGPT_ZIP = makeZip([
  { name: "chat.html", data: "<html><body>viewer</body></html>" },
  { name: "conversations.json", data: JSON.stringify(SAMPLE_CHATGPT) },
  { name: "user.json", data: "{}" },
]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const FACT = "I'm a fractional CFO for three climate-tech startups";
// The app nav, not the many "On Channels"-style links on Inputs.
const nav = (page: import("./test").Page) => page.getByRole("navigation", { name: "App" });
const onX = (page: import("./test").Page) => page.getByTestId("channel").getByText("X", { exact: true });

test("journey: import, set up, Inputs, X, examples, drafts on both channels, numbers, Results, Settings, usage", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Sign up, then the optional first step: bring a ChatGPT export.
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByRole("link", { name: "Import from ChatGPT or Claude" }).click();
  await expect(page.getByRole("heading", { name: "Bring your AI history" })).toBeVisible();
  await page.getByLabel("ChatGPT export file").setInputFiles({ name: "chatgpt-export.zip", mimeType: "application/zip", buffer: CHATGPT_ZIP });
  await expect(page.getByText("Your history is read. Review the suggestions below.")).toBeVisible();
  const fact = page.getByTestId("group-fact").getByTestId("suggestion").filter({ hasText: FACT });
  await fact.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Added to your facts.")).toBeVisible();

  // 2. Finish setup. The example answers replace the facts field, so the imported fact goes back on top.
  await page.getByRole("button", { name: "Continue setup" }).last().click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  const facts = page.getByLabel("Facts Cadence may state about you");
  await expect(facts).toHaveValue(new RegExp(FACT));
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await facts.fill(`${FACT}\n${await facts.inputValue()}`);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();

  // 3. Inputs lists the imported fact and the import itself, with a direction and a link home.
  await nav(page).getByRole("link", { name: "Inputs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inputs", level: 1 })).toBeVisible();
  await expect(page.getByTestId("input-facts").getByRole("textbox")).toHaveValue(new RegExp(FACT));
  const history = page.getByTestId("input-history"); // on the first tab, with the facts
  await expect(history.locator('[data-direction="increase"]')).toBeVisible(); // the other suggestions wait for review
  await expect(history.getByRole("button", { name: "Import or review suggestions" })).toHaveAttribute("href", "/app/import");

  // 4. Channels: X in one click.
  await nav(page).getByRole("link", { name: "Channels", exact: true }).click();
  const x = page.getByTestId("channel-x");
  await x.getByRole("button", { name: "Connect X" }).click();
  await expect(x).toContainText("Connected");

  // 5. Examples: upload one and rate it good; it's analysed before drafting reads it.
  await nav(page).getByRole("link", { name: "Examples", exact: true }).click();
  const add = page.getByTestId("add-example");
  await add.getByRole("tab", { name: "Upload" }).click();
  await add.getByLabel("File").setInputFiles({ name: "flow.png", mimeType: "image/png", buffer: PNG });
  await add.getByRole("button", { name: "Good" }).click();
  await add.getByRole("button", { name: "Add example" }).click();
  await expect(page.getByTestId("example").first().getByText("Analysed")).toBeVisible();
  await expect(page.getByTestId("teaches")).toContainText("From 1 liked and 0 disliked examples");

  // 6. Check in: a LinkedIn draft steered by the example, and its X version.
  await nav(page).getByRole("link", { name: "This week", exact: true }).click();
  await page.getByRole("button", { name: /use example notes/i }).click();
  await page.getByRole("button", { name: "Save check-in" }).click();
  const linkedin = page.locator('[data-testid="draft"][data-status="draft"]').filter({ hasNot: onX(page) }).first();
  await expect(linkedin).toBeVisible();
  await linkedin.getByText("Why this draft").click();
  await expect(linkedin.getByTestId("why")).toContainText("Steered by your rated examples: 1 liked, 0 disliked.");
  const xDraft = page.locator('[data-testid="draft"][data-status="draft"]').filter({ has: onX(page) }).first();
  await expect(xDraft).toBeVisible();
  await xDraft.getByText("Why this draft").click();
  await expect(xDraft.getByTestId("why")).toContainText("Written for X from the LinkedIn draft");

  // 7. Approve and post both.
  await linkedin.getByRole("button", { name: "Approve" }).click();
  await xDraft.getByRole("button", { name: "Approve" }).click();
  const scheduled = page.locator('[data-testid="draft"][data-status="scheduled"]');
  await expect(scheduled).toHaveCount(2);
  await scheduled.first().getByRole("button", { name: "Post now" }).click();
  await expect(scheduled).toHaveCount(1);
  await scheduled.first().getByRole("button", { name: "Post now" }).click();
  await expect(scheduled).toHaveCount(0);

  // 8. Published: both posts, and numbers typed in by hand for the LinkedIn one. The demo's own sample
  // captures can land seconds after a save, so save until it sticks (as in demo.spec).
  await expect(async () => {
    await page.goto("/app/published");
    await expect(page.getByTestId("publication")).toHaveCount(2, { timeout: 2000 });
    for (const p of await page.getByTestId("publication").all()) await expect(p).toContainText("Published", { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(async () => {
    await page.goto("/app/published");
    const post = page.getByTestId("publication").filter({ has: page.locator("summary", { hasText: /numbers/ }) }).first();
    await post.locator("summary", { hasText: /numbers/ }).click();
    const form = post.getByTestId("numbers-form");
    await form.getByLabel("Impressions").fill("2,500");
    await form.getByLabel("Members reached").fill("1800");
    await form.getByLabel("Followers gained").fill("3");
    await form.getByRole("button", { name: "Save numbers" }).click();
    await expect(page.getByText("Numbers saved")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2500);
    await page.reload();
    await expect(page.getByTestId("publication").filter({ hasText: "Entered by you" })).toHaveCount(1, { timeout: 2000 });
  }).toPass({ timeout: 60_000 });

  // 9. Results: one tab per connected channel.
  await page.goto("/app/results");
  await expect(page.getByRole("link", { name: "LinkedIn", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "X", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/results\?channel=x$/);
  await expect(page.getByRole("link", { name: "X", exact: true })).toHaveAttribute("aria-current", "page");

  // 10. Settings, from the account entry at the bottom of the nav: name, photo, annual billing.
  const account = page.getByTestId("account-nav").filter({ visible: true });
  await account.click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Dana R. Reyes");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(account.getByTestId("account-name")).toHaveText("Dana R. Reyes");
  await page.getByLabel("Upload a photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("photo-source")).toHaveText("Your uploaded photo.");
  await expect(account.locator("img")).toHaveAttribute("src", /^\/app\/settings\/photo\?v=\d+$/);
  await page.getByTestId("annual-offer").getByRole("button", { name: "Switch to annual — save 20%" }).click();
  await expect(page.getByTestId("billing-summary")).toContainText("$192 / year");

  // 11. Inputs reflects Settings: the billing row now reads annual; the profile row points to Settings.
  await page.goto("/app/inputs?tab=account");
  await expect(page.getByTestId("input-billing")).toContainText("Billed annually.");
  await expect(page.getByTestId("input-profile").getByRole("link", { name: "On Settings" })).toHaveAttribute("href", "/app/settings#profile");

  // 12. Admin usage counts both features this person used.
  await page.goto("/app/admin/usage");
  await expect(page.getByTestId("usage-features").getByRole("link", { name: "Examples" })).toHaveAttribute("aria-current", "page");
  let actions = page.getByTestId("usage-actions");
  for (const a of ["Uploaded", "Rated good", "Analysed"]) await expect(actions.getByRole("cell", { name: a, exact: true })).toBeVisible();
  await page.getByTestId("usage-features").getByRole("link", { name: "AI history import" }).click();
  await expect(page).toHaveURL(/feature=import/);
  await expect(page.getByTestId("flag-status")).toHaveCount(0); // import isn't behind a flag
  actions = page.getByTestId("usage-actions");
  for (const a of ["Uploaded", "Read", "Distilled", "Fact accepted"]) await expect(actions.getByRole("cell", { name: a, exact: true })).toBeVisible();
});
