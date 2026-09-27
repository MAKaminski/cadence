// Records the demo video from the running app (start `pnpm demo` first).
//   pnpm demo:record [outDir]
// Produces: an MP4 with burned-in captions, a WebVTT caption file, chapters.json, a poster, chapter stills
// and a short GIF. Raw output goes to outDir (default: a temp dir); the publishable files are copied to
// public/demo and docs/demo.
import { chromium, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { COUNTS } from "../../src/lib/catalog";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? mkdtempSync(path.join(tmpdir(), "cadence-demo-"));
const W = 1280, H = 800;
mkdirSync(OUT, { recursive: true });

const chapters: { t: number; title: string }[] = [];
let t0 = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function caption(page: Page, title: string, hold = 3500) {
  const t = (Date.now() - t0) / 1000;
  chapters.push({ t: Math.round(t * 10) / 10, title });
  await page.evaluate(`sessionStorage.setItem("demo-caption", ${JSON.stringify(title)}); window.__cap && window.__cap(${JSON.stringify(title)});`);
  await page.screenshot({ path: path.join(OUT, `still-${String(chapters.length).padStart(2, "0")}.png`) });
  await wait(hold);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } }, deviceScaleFactor: 1 });
  // A caption bar that survives navigation.
  // Passed as a string: tsx rewrites functions with a __name helper that doesn't exist in the browser.
  await ctx.addInitScript(`(() => {
    const paint = (text) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:980px;padding:14px 22px;border-radius:14px;background:rgba(17,17,39,.88);color:#fff;font:600 20px/1.35 system-ui,sans-serif;z-index:2147483647;box-shadow:0 8px 30px rgba(0,0,0,.3);text-align:center;pointer-events:none";
        document.documentElement.appendChild(el); // outside React's tree, so hydration leaves it alone
      }
      el.textContent = text;
      el.style.display = text ? "block" : "none";
    };
    window.__cap = paint;
    const restore = () => paint(sessionStorage.getItem("demo-caption") || "");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restore); else restore();
  })();`);
  const page = await ctx.newPage();
  t0 = Date.now();

  await page.goto(BASE);
  await caption(page, "Cadence: LinkedIn posts in your own voice, from two minutes a week. $20/month after a 7-day trial.", 4500);
  await page.mouse.wheel(0, 900); await wait(800);
  await caption(page, `Everything is visible: ${COUNTS.setup} settings you choose once, ${COUNTS.weekly} weekly actions, ${COUNTS.routines} automatic routines`, 4500);
  await page.mouse.wheel(0, 500); await wait(600);
  await caption(page, "Every draft is fixed, rewritten once, or held for you, by the same published rules", 4500);

  await page.goto(`${BASE}/login`);
  await caption(page, "Sign in. Real users use LinkedIn's official sign-in; the demo uses a throwaway account");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.waitForURL("**/checkout");
  await caption(page, "Card first, 7 days free. Real users go to Stripe Checkout; the demo takes no card");
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.waitForURL("**/onboarding");

  await caption(page, "Setup 1 of 3: who you are, who you want to reach, and the only facts Cadence may state", 3000);
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.locator("#facts").scrollIntoViewIfNeeded(); await wait(2500);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await caption(page, "Setup 2 of 3: three of your own posts teach it your voice, plus topics and a never-write-about list", 3000);
  await page.getByRole("button", { name: /fill in the example answers/i }).click(); await wait(2000);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await caption(page, "Setup 3 of 3: posts per week, days, time, and the writing model (Claude Sonnet 5 or Opus 5)", 3000);
  await page.getByRole("button", { name: "Finish setup" }).scrollIntoViewIfNeeded(); await wait(2000);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL("**/app");

  await caption(page, "Each week: two minutes of rough notes. That's the only regular input", 2500);
  await page.getByRole("button", { name: /use example notes/i }).click(); await wait(2500);
  await page.getByRole("button", { name: "Save check-in" }).click();
  await caption(page, "Cadence writes 2 versions of each post in your voice, checks both, and keeps the better one", 2500);
  await page.getByTestId("draft").first().waitFor({ timeout: 60_000 }); await wait(1500);
  await caption(page, "Drafts are ready. Nothing posts until you approve it", 3500);

  const first = page.locator('[data-testid="draft"][data-status="draft"]').first();
  await first.getByText("Why this draft").click();
  await first.getByTestId("why").scrollIntoViewIfNeeded();
  await caption(page, "Why this draft: the angle, every check it passed, what was fixed automatically, and what it cost", 6000);

  await first.getByRole("button", { name: "Edit" }).click();
  const box = first.getByRole("textbox", { name: "Edit post" });
  await box.fill(`${(await box.inputValue()).trimEnd()}\n\n`);
  await box.pressSequentially("What's worked for you?", { delay: 45 });
  await caption(page, "Edit anything. Your version is re-checked but never rewritten: you're the author", 2500);
  await first.getByRole("button", { name: "Save changes" }).click(); await wait(1500);

  const ready = page.locator('[data-testid="draft"][data-status="draft"]').first();
  await ready.getByRole("button", { name: "Approve" }).click(); await wait(1500);
  const scheduled = page.locator('[data-testid="draft"][data-status="scheduled"]').first();
  await scheduled.scrollIntoViewIfNeeded();
  await caption(page, "Approved: the exact text is locked and scheduled into your next posting slot, in your time zone", 4500);
  await scheduled.getByRole("button", { name: "Post now" }).click();
  await caption(page, "Or post now. It goes out once through LinkedIn's official API (recorded, not sent, in the demo)", 3500);
  await page.locator('[data-testid="draft"][data-status="scheduled"]').first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});

  await page.goto(`${BASE}/app/published`);
  await caption(page, "Published. Results arrive once LinkedIn approves analytics; the demo shows sample numbers", 4500);
  await page.goto(`${BASE}/app/settings`);
  await caption(page, "Settings: edit your setup, see this month's model use, and unlock automatic posting after 5 clean approvals", 4500);
  await page.goto(`${BASE}/how-it-works`);
  await caption(page, "Every rule is public. Run it yourself: git clone, pnpm install, pnpm demo. MIT licensed.", 4500);

  const video = page.video();
  await ctx.close(); await browser.close();
  const webm = await video!.path();

  // WebVTT + chapters.
  const end = (Date.now() - t0) / 1000;
  const ts = (s: number) => new Date(s * 1000).toISOString().slice(11, 23);
  const vtt = ["WEBVTT", "", ...chapters.flatMap((c, i) => [`${i + 1}`, `${ts(c.t)} --> ${ts(chapters[i + 1]?.t ?? end)}`, c.title, ""])].join("\n");
  writeFileSync(path.join(OUT, "cadence-demo.vtt"), vtt);
  writeFileSync(path.join(OUT, "chapters.json"), JSON.stringify(chapters, null, 2) + "\n");

  const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
  const mp4 = path.join(OUT, "cadence-demo.mp4");
  ff("-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4);
  // The GIF: the heart of the product (drafts -> why -> approve), ~20 s, small enough for a README.
  const gStart = chapters.find((c) => c.title.startsWith("Drafts are ready"))?.t ?? 0;
  const gif = path.join(OUT, "cadence-demo.gif");
  ff("-ss", String(gStart), "-t", "20", "-i", mp4, "-vf", "fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=5", gif);
  ff("-ss", String(chapters[0].t + 1), "-i", mp4, "-frames:v", "1", path.join(OUT, "poster.png"));

  mkdirSync("public/demo", { recursive: true }); mkdirSync("docs/demo", { recursive: true });
  for (const f of ["cadence-demo.mp4", "cadence-demo.vtt", "chapters.json", "poster.png"]) copyFileSync(path.join(OUT, f), path.join("public/demo", f));
  copyFileSync(gif, "docs/demo/cadence-demo.gif");
  for (const f of readdirSync(OUT).filter((f) => f.startsWith("still-"))) copyFileSync(path.join(OUT, f), path.join("docs/demo", f));
  console.log(`Recorded ${Math.round(end)}s, ${chapters.length} chapters -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
