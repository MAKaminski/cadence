// Records the Help page's demo videos from the running app in demo mode (start `pnpm demo` first):
//   pnpm help:record [topic-id …]
// One short clip per topic in src/lib/help.ts, with captions burned in, saved as public/help/<id>.mp4 and a
// poster public/help/<id>.jpg. Each clip starts from a demo account already in the right state (made off
// camera), so it shows only its own action. Needs ffmpeg on PATH.
import { chromium, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HELP } from "../../src/lib/help";
import { SAMPLE_CHATGPT } from "../../src/lib/history-samples";
import { makeZip } from "../../tests/fixtures/zip";
import { ACTIVITY_PASTE } from "../../tests/fixtures/linkedin-activity";
import { engineExport } from "../../tests/fixtures/engine-export";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const W = 1280, H = 800, OUT = "public/help";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type State = NonNullable<BrowserContextOptions["storageState"]>;
let ip = 0;
const headers = () => ({ "x-forwarded-for": `10.77.${Math.floor(++ip / 250)}.${(ip % 250) + 1}` });

const LINKEDIN_EXPORT = makeZip([
  { name: "Basic_LinkedInDataExport/Profile.csv", data: 'First Name,Last Name,Headline,Summary,Industry,Geo Location\nDana,Reyes,"Swing trader | Options educator",,Financial Services,"Atlanta, Georgia"' },
  { name: "Basic_LinkedInDataExport/Positions.csv", data: "Company Name,Title,Description,Location,Started On,Finished On\nReyes Trading LLC,Founder and trader,,Atlanta,Mar 2021,\nAcme Bank,Equity analyst,,New York,Jun 2016,Feb 2021" },
  { name: "Basic_LinkedInDataExport/Skills.csv", data: "Name\nTechnical Analysis\nRisk Management" },
]);
const CHATGPT_ZIP = makeZip([{ name: "conversations.json", data: JSON.stringify(SAMPLE_CHATGPT) }, { name: "user.json", data: "{}" }]);

/** A demo account in a given state, made without recording. */
async function prepare(browser: Browser, upTo: "trial" | "step2" | "setup" | "drafts" | "posted"): Promise<State> {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, extraHTTPHeaders: headers() });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByText("Step 1 of 3").waitFor();
  if (upTo !== "trial") {
    await page.getByRole("button", { name: /fill in the example answers/i }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await page.getByText("Step 2 of 3").waitFor();
  }
  if (["setup", "drafts", "posted"].includes(upTo)) {
    await page.getByRole("button", { name: /fill in the example answers/i }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.getByRole("heading", { name: "This week" }).waitFor();
  }
  if (upTo === "drafts" || upTo === "posted") {
    await page.getByRole("button", { name: /use example notes/i }).click();
    await page.getByRole("button", { name: "Save check-in" }).click();
    await page.locator('[data-testid="draft"][data-status="draft"]').first().waitFor({ timeout: 60_000 });
  }
  if (upTo === "posted") {
    await page.locator('[data-testid="draft"][data-status="draft"]').first().getByRole("button", { name: "Approve" }).click();
    const scheduled = page.locator('[data-testid="draft"][data-status="scheduled"]').first();
    await scheduled.getByRole("button", { name: "Post now" }).click();
    await page.waitForTimeout(3000);
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function record(browser: Browser, id: string, state: State | undefined, run: (page: Page, cap: (t: string, hold?: number) => Promise<void>) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), `help-${id}-`));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } }, storageState: state, extraHTTPHeaders: headers() });
  // The caption bar from scripts/demo/record.ts: survives navigation, outside React's tree.
  await ctx.addInitScript(`(() => {
    const paint = (text) => {
      let el = document.getElementById("demo-caption");
      if (!el) { el = document.createElement("div"); el.id = "demo-caption"; el.setAttribute("aria-hidden", "true");
        el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:980px;padding:14px 22px;border-radius:14px;background:rgba(17,17,39,.88);color:#fff;font:600 20px/1.35 system-ui,sans-serif;z-index:2147483647;box-shadow:0 8px 30px rgba(0,0,0,.3);text-align:center;pointer-events:none";
        document.documentElement.appendChild(el); }
      el.textContent = text; el.style.display = text ? "block" : "none";
    };
    window.__cap = paint;
    const restore = () => paint(sessionStorage.getItem("demo-caption") || "");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restore); else restore();
  })();`);
  const page = await ctx.newPage();
  const cap = async (t: string, hold = 2800) => {
    await page.evaluate(`sessionStorage.setItem("demo-caption", ${JSON.stringify(t)}); window.__cap && window.__cap(${JSON.stringify(t)});`);
    await wait(hold);
  };
  await run(page, cap);
  await wait(800);
  const video = page.video();
  await ctx.close();
  const webm = await video!.path();
  const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
  ff("-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "32", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", path.join(OUT, `${id}.mp4`));
  ff("-sseof", "-1.5", "-i", path.join(OUT, `${id}.mp4`), "-frames:v", "1", "-vf", "scale=800:-1", "-q:v", "5", path.join(OUT, `${id}.jpg`));
  rmSync(dir, { recursive: true, force: true });
  console.log(`recorded ${id}`);
}

const CLIPS: Record<string, (b: Browser) => Promise<void>> = {
  "sign-in": (b) => record(b, "sign-in", undefined, async (page, cap) => {
    await page.goto(`${BASE}/login`);
    await cap("Sign in with LinkedIn, or get a sign-in link by email");
    await page.getByRole("button", { name: "Continue as demo user" }).click();
    await page.getByRole("button", { name: /start demo trial/i }).waitFor();
    await cap("Start the 7-day trial: nothing is charged for 7 days (the demo takes no card)");
    await page.getByRole("button", { name: /start demo trial/i }).click();
    await page.getByText("Step 1 of 3").waitFor();
    await cap("You land in setup", 2500);
  }),
  "quick-fill": async (b) => record(b, "quick-fill", await prepare(b, "trial"), async (page, cap) => {
    await page.goto(`${BASE}/onboarding`);
    await cap("Quick fill: upload your LinkedIn export, or paste your profile");
    await page.getByLabel("Upload your LinkedIn export").setInputFiles({ name: "Basic_LinkedInDataExport.zip", mimeType: "application/zip", buffer: LINKEDIN_EXPORT });
    await page.getByTestId("li-read").waitFor();
    await cap("What you do, your facts and your picks are filled in", 2500);
    await page.getByTestId("picks-audience").scrollIntoViewIfNeeded();
    await cap("Picks follow what you do, with sensible ones ticked. Click to add more");
    await page.getByTestId("picks-audience").getByRole("button", { name: "Options traders" }).click();
    await page.getByLabel("Facts Cadence may state about you").scrollIntoViewIfNeeded();
    await cap("Facts come only from your own data. Check them, then save", 3000);
  }),
  "best-posts": async (b) => record(b, "best-posts", await prepare(b, "step2"), async (page, cap) => {
    await page.goto(`${BASE}/onboarding`);
    await page.getByTestId("best-posts").scrollIntoViewIfNeeded();
    await cap("Your best posts: paste your LinkedIn Activity page");
    await page.getByLabel("Pasted Activity page").fill(ACTIVITY_PASTE);
    await page.getByRole("button", { name: "Find my best posts" }).click();
    await page.getByTestId("best-post").first().waitFor();
    await page.getByTestId("best-post").first().scrollIntoViewIfNeeded();
    await cap("Ranked by reactions + 2 × comments + 3 × reposts. The top three are ticked", 3500);
    await page.getByLabel("A post you've written (1 of 3)").scrollIntoViewIfNeeded();
    await cap("They fill your voice samples. Tick a different post to swap", 3000);
  }),
  "import-history": async (b) => record(b, "import-history", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/import`);
    await page.getByLabel("ChatGPT export file").scrollIntoViewIfNeeded();
    await cap("Bring your ChatGPT or Claude history: upload the export as it came");
    await page.getByLabel("ChatGPT export file").setInputFiles({ name: "chatgpt-export.zip", mimeType: "application/zip", buffer: CHATGPT_ZIP });
    await page.getByText("Your history is read. Review the suggestions below.").waitFor({ timeout: 60_000 });
    await page.getByTestId("group-fact").scrollIntoViewIfNeeded();
    await cap("Accept what's true about you. Only accepted suggestions join your setup", 3500);
    await page.getByTestId("group-fact").getByRole("button", { name: "Accept" }).first().click();
    await cap("Added to your facts", 2000);
  }),
  "import-engine": async (b) => record(b, "import-engine", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/import`);
    await cap("Bring your LinkedIn Engine history: one export file");
    await page.getByLabel("LinkedIn Engine export (.json)").setInputFiles({ name: "linkedin-engine-export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(engineExport())) });
    await page.getByTestId("engine-import-result").waitFor();
    await cap("Posts, pillars, hooks, scores and every capture of the numbers come across", 3000);
    await page.getByRole("link", { name: "See them on Results" }).click();
    await page.getByTestId("totals").waitFor();
    await cap("Results starts from your real history", 2500);
    await page.getByTestId("chart-what-works").scrollIntoViewIfNeeded();
    await cap("Including what works by hook, time of day and rubric score", 3500);
  }),
  "check-in": async (b) => record(b, "check-in", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app`);
    await cap("Each week, write a few lines about what happened");
    await page.getByRole("button", { name: /use example notes/i }).click();
    await wait(1200);
    await page.getByRole("button", { name: "Save check-in" }).click();
    const d = page.locator('[data-testid="draft"][data-status="draft"]').first();
    await d.waitFor({ timeout: 60_000 });
    await d.scrollIntoViewIfNeeded();
    await cap("Drafts arrive in your voice, from your notes and facts", 3000);
    await d.getByText("Why this draft").click();
    await cap("Why this draft: the angle, the checks it passed and what steered it", 3500);
  }),
  approve: async (b) => record(b, "approve", await prepare(b, "drafts"), async (page, cap) => {
    await page.goto(`${BASE}/app`);
    const d = page.locator('[data-testid="draft"][data-status="draft"]').first();
    await d.scrollIntoViewIfNeeded();
    await cap("Nothing posts without you. Edit if you like, then approve");
    await d.getByRole("button", { name: "Approve" }).click();
    const s = page.locator('[data-testid="draft"][data-status="scheduled"]').first();
    await s.waitFor(); await s.scrollIntoViewIfNeeded();
    await cap("Approved drafts are scheduled into your next posting slot", 3000);
    await s.getByRole("button", { name: "Post now" }).click();
    await cap("Or post one right away", 2500);
  }),
  "connect-x": async (b) => record(b, "connect-x", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/channels`);
    await cap("Channels: where your posts go");
    const x = page.getByTestId("channel-x");
    await x.scrollIntoViewIfNeeded();
    await x.getByRole("button", { name: "Connect X" }).click();
    await x.getByText("Connected").waitFor();
    await cap("One click, then approve on X. Each LinkedIn draft gets an X version", 3500);
  }),
  inputs: async (b) => record(b, "inputs", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/inputs`);
    await cap("Inputs: everything you tell Cadence, in tabs");
    const tabs = page.getByTestId("input-tabs");
    for (const t of ["How you sound", "How much and when", "Where it goes"]) { await tabs.getByRole("link", { name: t }).click(); await wait(1500); }
    await cap("Each input says what it drives and whether to keep, raise or lower it", 3500);
  }),
  plan: async (b) => record(b, "plan", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/plan`);
    await cap("Plan: how much you post and comment, and when");
    const posting = page.getByTestId("posting");
    await posting.getByRole("button", { name: "One more posts a week" }).click();
    await cap("See what a change does before you apply it", 2500);
    await posting.getByRole("button", { name: "Apply" }).click();
    const comments = page.getByTestId("comments");
    await comments.scrollIntoViewIfNeeded();
    await comments.getByRole("spinbutton", { name: "Comments a day" }).fill("3");
    await comments.getByRole("button", { name: "Apply" }).click();
    await cap("Comments land on the timeline in your window", 3000);
  }),
  numbers: async (b) => record(b, "numbers", await prepare(b, "posted"), async (page, cap) => {
    await page.goto(`${BASE}/app/published`);
    await cap("Published: every post, with its numbers");
    const post = page.getByTestId("publication").filter({ has: page.locator("summary", { hasText: /numbers/ }) }).first();
    await post.locator("summary", { hasText: /numbers/ }).click();
    const form = post.getByTestId("numbers-form");
    await form.getByLabel("Impressions").fill("2,500"); await wait(400);
    await form.getByLabel("Members reached").fill("1800"); await wait(400);
    await cap("Copy them from LinkedIn's View analytics", 2500);
    await form.getByRole("button", { name: "Save numbers" }).click();
    await cap("They show on Results straight away", 2500);
  }),
  results: async (b) => record(b, "results", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/inputs`);
    await page.getByTestId("seed-history").getByRole("button", { name: "Steady" }).click(); // demo: a sample history
    await page.goto(`${BASE}/app/results`);
    await cap("Results: what you put out, and what it did");
    await page.getByTestId("ranges").getByRole("link", { name: "4 weeks" }).click(); await wait(1500);
    await page.getByTestId("ranges").getByRole("link", { name: "All time" }).click();
    await cap("Pick a time frame: totals, reach, engagement rate and your best post", 3000);
    await page.getByTestId("chart-what-works").scrollIntoViewIfNeeded();
    await cap("What works for you, by angle, weekday, length and time of day", 3500);
  }),
  settings: async (b) => record(b, "settings", await prepare(b, "setup"), async (page, cap) => {
    await page.goto(`${BASE}/app/settings`);
    await cap("Settings: your name, photo and billing");
    await page.getByTestId("annual-offer").scrollIntoViewIfNeeded();
    await cap("Switch to annual: 12 × $20 = $240, annual is $192, so you save $48", 3500);
  }),
};

async function main() {
  const only = process.argv.slice(2);
  const ids = HELP.map((t) => t.id).filter((id) => !only.length || only.includes(id));
  const missing = HELP.map((t) => t.id).filter((id) => !CLIPS[id]);
  if (missing.length) throw new Error(`No clip for: ${missing.join(", ")}`);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const id of ids) await CLIPS[id](browser);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
