import { expect, test } from "./test";
import { HELP } from "../src/lib/help";

// Help is public: no sign-in, every topic with its demo video, steps and questions.
test("help: every action has a demo video and FAQs, open to everyone", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Help" }).click();
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();
  await expect(page.getByTestId("help-topic")).toHaveCount(HELP.length);
  for (const t of HELP) {
    const topic = page.locator(`#${t.id}`);
    await expect(topic.getByRole("heading", { name: t.title })).toBeVisible();
    const src = await topic.locator("video source").getAttribute("src");
    const res = await request.get(src!);
    expect(res.status(), src!).toBe(200);
    expect(res.headers()["content-type"]).toContain("video/mp4");
  }
  const q = page.locator("#best-posts details").first();
  await q.locator("summary").click();
  await expect(q).toContainText("Activity page");
});
