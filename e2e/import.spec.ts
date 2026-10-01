import { expect, test, type Page } from "./test";
import { SAMPLE_CHATGPT, SAMPLE_CLAUDE } from "../src/lib/history-samples";
import { makeZip } from "../tests/fixtures/zip";

// Invented exports in the real shapes: a ChatGPT .zip (with the viewer and user files beside the
// conversations) and a Claude .zip.
const CHATGPT_ZIP = makeZip([
  { name: "chat.html", data: "<html><body>viewer</body></html>" },
  { name: "conversations.json", data: JSON.stringify(SAMPLE_CHATGPT) },
  { name: "user.json", data: "{}" },
]);
const CLAUDE_ZIP = makeZip([{ name: "conversations.json", data: JSON.stringify(SAMPLE_CLAUDE) }, { name: "users.json", data: "[]" }]);

async function signUpAndSetUp(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  // Setup offers the import as an optional first step.
  await expect(page.getByTestId("bring-history")).toBeVisible();
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
}

test("import: a ChatGPT and a Claude export become suggestions; accepting a fact adds it to setup", async ({ page }) => {
  await signUpAndSetUp(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Import your AI history" }).click();
  await expect(page.getByRole("heading", { name: "Import your AI history" })).toBeVisible();
  await expect(page.getByText("How to get your ChatGPT export")).toBeVisible();

  // Something that isn't an export is refused before the rest is sent.
  await page.getByLabel("ChatGPT export file").setInputFiles({ name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("just some text, not a zip") });
  await expect(page.getByText(/isn't a ChatGPT or Claude export/)).toBeVisible();

  // ChatGPT: upload, the worker reads it, the page shows what was found.
  await page.getByLabel("ChatGPT export file").setInputFiles({ name: "chatgpt-export.zip", mimeType: "application/zip", buffer: CHATGPT_ZIP });
  await expect(page.getByText("Your history is read. Review the suggestions below.")).toBeVisible();
  const rows = page.getByTestId("import-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("ChatGPT");
  await expect(rows.first()).toContainText("$0.0000");
  await expect(rows.first()).toContainText("Done");

  const facts = page.getByTestId("group-fact");
  const fact = facts.getByTestId("suggestion").filter({ hasText: "I'm a fractional CFO for three climate-tech startups" });
  await expect(fact).toBeVisible();
  await expect(fact).toContainText("You wrote:");
  for (const k of ["topic", "voice", "idea"]) await expect(page.getByTestId(`group-${k}`)).toBeVisible();
  // The export's one never-write-about item is Contoso, which the demo setup already has: not suggested again.
  await expect(page.getByTestId("group-no_go")).toHaveCount(0);

  // Accept one fact: it's added to setup.
  await fact.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Added to your facts.")).toBeVisible();
  await expect(fact.getByText("Added")).toBeVisible();

  // Claude: a second export on top.
  await page.getByLabel("Claude export file").setInputFiles({ name: "claude-export.zip", mimeType: "application/zip", buffer: CLAUDE_ZIP });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Claude");
  await expect(page.getByTestId("group-no_go")).toContainText("my kids");

  // The fact is in setup now.
  await page.goto("/onboarding?edit=1");
  await expect(page.getByLabel("Facts Cadence may state about you")).toHaveValue(/I'm a fractional CFO for three climate-tech startups/);

  // Delete imported data: the imports and pending suggestions go; the accepted fact stays.
  await page.goto("/app/import");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete imported data" }).click();
  await expect(page.getByText("Imported data deleted.")).toBeVisible();
  await expect(page.getByTestId("import-row")).toHaveCount(0);
  await expect(page.getByTestId("suggestions")).toHaveCount(0);
  await page.goto("/onboarding?edit=1");
  await expect(page.getByLabel("Facts Cadence may state about you")).toHaveValue(/I'm a fractional CFO for three climate-tech startups/);
});

test("import: the optional setup step works before setup is finished", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByRole("link", { name: "Import from ChatGPT or Claude" }).click();
  await expect(page.getByRole("heading", { name: "Bring your AI history" })).toBeVisible();
  await page.getByRole("button", { name: "Use the sample Claude export (demo)" }).click();
  await expect(page.getByText("Your history is read. Review the suggestions below.")).toBeVisible();
  const fact = page.getByTestId("group-fact").getByTestId("suggestion").first();
  const text = (await fact.locator("p").first().innerText()).trim();
  await fact.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Added to your facts.")).toBeVisible();
  await page.getByRole("button", { name: "Continue setup" }).last().click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByLabel("Facts Cadence may state about you")).toHaveValue(text);
});
