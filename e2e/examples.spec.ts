import { expect, test, type Page } from "./test";

// A 1×1 PNG with a post-like body is enough: the demo analyst reads it like the real one would.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

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

test("examples: upload one, rate it, see what it teaches, and measure it", async ({ page }) => {
  await signUpAndSetUp(page);
  await page.getByRole("link", { name: "Examples" }).click();
  await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
  await expect(page.getByTestId("examples-empty")).toBeVisible();

  // A link to the server's own network is refused before any request.
  const add = page.getByTestId("add-example");
  await add.getByLabel("Link").fill("http://127.0.0.1/admin");
  await add.getByRole("button", { name: "Add example" }).click();
  await expect(page.getByText("That address isn't on the public internet.")).toBeVisible();

  // Upload a file rated good.
  await add.getByRole("tab", { name: "Upload" }).click();
  await add.getByLabel("File").setInputFiles({ name: "flow.png", mimeType: "image/png", buffer: PNG });
  await add.getByLabel(/What stands out/).fill("The diagram explains it before you read a word.");
  await add.getByRole("button", { name: "Good" }).click();
  await add.getByRole("button", { name: "Add example" }).click();
  await expect(page.getByText("Added. Cadence is reading it now.")).toBeVisible();

  // The worker analyses it; the page refreshes itself until it's done.
  const card = page.getByTestId("example").first();
  await expect(card.getByText("Analysed")).toBeVisible();
  await expect(card.getByRole("img")).toBeVisible();
  await expect(card.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("teaches")).toContainText("From 1 liked and 0 disliked examples");

  // Flip the rating: now it's a pattern to avoid.
  await card.getByRole("button", { name: "Bad" }).click();
  await expect(page.getByTestId("teaches")).toContainText("From 0 liked and 1 disliked examples");

  // The operator's usage page counts all of it (demo mode makes everyone an operator).
  await page.getByRole("link", { name: "Usage" }).click();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await expect(page.getByTestId("flag-status")).toContainText("Demo mode: on for everyone.");
  const actions = page.getByTestId("usage-actions");
  for (const a of ["Uploaded", "Rated good", "Rated bad", "Analysed"]) await expect(actions.getByRole("cell", { name: a, exact: true })).toBeVisible();
});
