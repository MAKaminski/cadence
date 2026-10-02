import { expect, test } from "./test";
import { makeZip } from "../tests/fixtures/zip";

// Setup filled in from a LinkedIn export, then adjusted with quick picks: a trader who has a few posts.
const EXPORT = makeZip([
  { name: "Basic_LinkedInDataExport/Profile.csv", data: 'First Name,Last Name,Headline,Summary,Industry,Geo Location\nDana,Reyes,"Swing trader | Options educator",,Financial Services,"Atlanta, Georgia"' },
  { name: "Basic_LinkedInDataExport/Positions.csv", data: "Company Name,Title,Description,Location,Started On,Finished On\nReyes Trading LLC,Founder and trader,,Atlanta,Mar 2021,\nAcme Bank,Equity analyst,,New York,Jun 2016,Feb 2021" },
  { name: "Basic_LinkedInDataExport/Skills.csv", data: "Name\nTechnical Analysis\nRisk Management" },
  { name: "Basic_LinkedInDataExport/Shares.csv", data: 'Date,ShareLink,ShareCommentary\n2026-09-20 14:01:00,x,"Lost 2R on a breakout this week. The setup was fine; the size was not. Back to fixed risk per trade, and a journal note."\n2026-08-11 09:00:00,y,"Three rules I keep: size by the stop, never add to a loser, and journal every trade the same night."' },
  { name: "Basic_LinkedInDataExport/messages.csv", data: "private" },
]);

test("setup: quick fill from a LinkedIn export, then quick picks", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();

  // Before anything is typed, the picks are generic; typing the role turns them into a trader's, ticked.
  const audience = page.getByTestId("picks-audience");
  await page.getByLabel("What do you do?").fill("I'm a short and medium term trader");
  await expect(audience.getByRole("button", { name: "Active retail traders" })).toHaveAttribute("aria-pressed", "true");

  // The export fills this page and the next.
  await page.getByLabel("What do you do?").fill("");
  await page.getByLabel("Upload your LinkedIn export").setInputFiles({ name: "Basic_LinkedInDataExport.zip", mimeType: "application/zip", buffer: EXPORT });
  await expect(page.getByTestId("li-read")).toHaveText("Read from your export: headline, 2 roles, 2 skills, 2 posts.");
  await expect(page.getByLabel("What do you do?")).toHaveValue("Swing trader | Options educator");
  await expect(page.getByLabel("Facts Cadence may state about you")).toHaveValue(/Equity analyst at Acme Bank, 2016–2021/);
  await expect(page.getByTestId("picks-goals").getByRole("button", { name: "Grow subscribers to my channel" })).toHaveAttribute("aria-pressed", "true");

  // Several picks at once, plus one of their own.
  await audience.getByRole("button", { name: "Options traders" }).click();
  await page.getByLabel("Add your own: Who do you want to reach?").fill("Prop firm traders");
  await page.keyboard.press("Enter");
  await expect(audience.getByRole("button", { name: "Prop firm traders" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.getByLabel("A post you've written (1 of 3)")).toHaveValue(/Lost 2R on a breakout/);
  const noGo = page.getByTestId("picks-noGo");
  await expect(noGo.getByRole("button", { name: "Personalized investment advice" })).toHaveAttribute("aria-pressed", "true");
  await noGo.getByRole("button", { name: "Specific buy or sell calls" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();

  // What was picked is what was saved.
  await page.goto("/onboarding?edit=1&step=1");
  for (const a of ["Active retail traders", "Options traders", "Prop firm traders"]) await expect(audience.getByRole("button", { name: a })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/onboarding?edit=1&step=2");
  await expect(noGo.getByRole("button", { name: "Specific buy or sell calls" })).toHaveAttribute("aria-pressed", "true");
});

test("setup: no posts yet — picking how you sound is enough", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByLabel("What do you do?").fill("Backend engineer building AI agents");
  await page.getByRole("button", { name: "Quick fill" }).first().click();
  await expect(page.getByTestId("picks-audience").getByRole("button", { name: "Engineers who build similar systems" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Facts Cadence may state about you").fill("Backend engineer at Northwind, 2022–present");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.getByTestId("picks-style").getByRole("button", { pressed: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
});

test("setup: your three best posts, ranked from your pasted Activity page", async ({ page }) => {
  const { ACTIVITY_PASTE } = await import("../tests/fixtures/linkedin-activity");
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByLabel("What do you do?").fill("Swing trader who teaches options");
  await page.getByLabel("Facts Cadence may state about you").fill("Trading US equities and options since 2019");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();

  const best = page.getByTestId("best-posts");
  await best.getByLabel("Pasted Activity page").fill(ACTIVITY_PASTE);
  await best.getByRole("button", { name: "Find my best posts" }).click();
  const cards = best.getByTestId("best-post");
  await expect(cards).toHaveCount(3); // the repost and the short post are left out
  await expect(cards.first().getByTestId("best-post-numbers")).toHaveText("1,200 reactions · 96 comments · 40 reposts · score 1,512");
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("A post you've written (1 of 3)")).toHaveValue(/^Three rules I keep/);
  await expect(page.getByLabel("A post you've written (3 of 3)")).toHaveValue(/^Lost 2R on a breakout/);

  // Untick the weakest: its box empties.
  await cards.nth(2).click();
  await expect(page.getByLabel("A post you've written (3 of 3)")).toHaveValue("");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.goto("/onboarding?edit=1&step=2");
  await expect(page.getByLabel("A post you've written (1 of 3)")).toHaveValue(/^Three rules I keep/);
  await expect(page.getByLabel("A post you've written (2 of 3)")).toHaveValue(/^Markets were closed today/);
});
