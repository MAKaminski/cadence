import { expect, test, type Page } from "./test";

// A 1×1 PNG: the server crops it to a 256 × 256 WebP like any other photo.
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

test("settings: rename, upload a photo and see both in the sidebar, then switch to annual billing", async ({ page }) => {
  await signUpAndSetUp(page);
  const nav = page.getByTestId("account-nav").filter({ visible: true });

  // The gear at the bottom of the sidebar opens Settings.
  await expect(nav.getByTestId("account-name")).toHaveText("Dana Reyes");
  await nav.click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  for (const s of ["Account", "Writing and posting", "Connections", "Danger zone"]) await expect(page.getByRole("heading", { name: s, level: 2 })).toBeVisible();
  for (const c of ["Profile", "Billing", "Your setup", "Posting", "LinkedIn connection", "Connected assistants", "API keys", "Delete account"]) {
    await expect(page.getByText(c, { exact: true }).first()).toBeVisible();
  }

  // Name.
  await page.getByLabel("Name", { exact: true }).fill("Dana R. Reyes");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(nav.getByTestId("account-name")).toHaveText("Dana R. Reyes");

  // Photo: no LinkedIn picture in demo mode, so initials until one is uploaded.
  await expect(page.getByTestId("photo-source")).toHaveText("No photo yet: your initials show instead.");
  await page.getByLabel("Upload a photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Photo updated.")).toBeVisible();
  await expect(page.getByTestId("photo-source")).toHaveText("Your uploaded photo.");
  const img = nav.locator("img");
  await expect(img).toHaveAttribute("src", /^\/app\/settings\/photo\?v=\d+$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(256);
  const served = await page.request.get((await img.getAttribute("src"))!);
  expect(served.headers()["content-type"]).toBe("image/webp");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  // Something that isn't an image is refused by its bytes, whatever it's called.
  await page.getByLabel("Upload a photo").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await expect(page.getByText("Use a PNG, JPEG or WebP photo.")).toBeVisible();

  // Back to no photo.
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByTestId("photo-source")).toHaveText("No photo yet: your initials show instead.");
  await expect(nav.locator("img")).toHaveCount(0);

  // Billing: monthly trial, with the annual offer and its math.
  const summary = page.getByTestId("billing-summary");
  await expect(summary).toContainText("billed monthly (free trial)");
  await expect(summary).toContainText("$20 / month");
  const offer = page.getByTestId("annual-offer");
  await expect(offer).toContainText("$20/mo × 12 = $240 a year. Billed annually: $192/yr, saving $48.");
  await offer.getByRole("button", { name: "Switch to annual — save 20%" }).click();
  await expect(page.getByText("Switched to annual billing (demo: no charge).")).toBeVisible();
  await expect(summary).toContainText("billed annually (free trial)");
  await expect(summary).toContainText("$192 / year");
  await expect(offer).toHaveCount(0);
});
