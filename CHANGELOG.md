# Changelog

All notable changes to Cadence. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Every sign-in route answered 500 on a server without Stripe keys** (2026-10-01, after the deploy of `f494b07`): `deploy/.env` lists every setting, so an unset `STRIPE_SECRET_KEY` arrives as an empty string, and `new Stripe("")` threw while the auth module loaded. The placeholder now covers empty as well as missing (`||`), and sign-up no longer calls Stripe until a key is set (checkout creates the customer). `tests/auth-boot.test.ts` loads the auth module with every optional setting blank.
- `/app/inputs` no longer logs an error for someone who hasn't finished setup (they were already sent to setup).

### Added
- **Inputs, in tabs** (`/app/inputs?tab=`):
  - One tab per group: Who you are, How you sound, What drafts learn from, How much and when, Where it goes, Your account. The page is no longer one long scroll.
  - Each tab shows a badge with the number of its inputs your results say to raise or lower.
  - The tab bar stays in view as you scroll.
  - Each page's **All inputs →** link opens the tab with that page's inputs.
- **Setup: your three best-performing posts** (step 2). LinkedIn's export has post text but no numbers, and its API keeps both behind partner scopes, so step 2 asks for the Activity page instead.
  - **How:** open your Activity page, select all, copy and paste. Cadence reads each of your own posts with its reactions, comments and reposts (`src/lib/activity-posts.ts`); reposts of other people's posts and posts under 80 characters are left out.
  - **Ranking:** posts are ranked by reactions + 2 × comments + 3 × reposts, and the top three are ticked and fill the three sample boxes. For example, 1,200 reactions, 96 comments and 40 reposts score 1,200 + 192 + 120 = 1,512.
  - **Your picks:** tick or untick to change which posts are used; the boxes stay editable.
  - **Other sources:** posts published through Cadence with numbers rank alongside. The export's posts show without numbers, after the ranked ones.
  - **Claude's role:** Claude reads the paste when `ANTHROPIC_API_KEY` is set, and a post is kept only if its text is word for word in the paste.
  - **Usage:** recorded as `setup` / `best posts`.
  - **Export without posts:** step 1 now says when the export has no posts. LinkedIn leaves `Shares.csv` out of the quick archive.
- **Setup: Quick fill and quick picks** (`/onboarding`, steps 1 and 2). Most people should be able to click through setup instead of typing it.
  - **Quick picks**: audience, goals, topics, the never-list and a new **How do you sound?** are chips. You can pick several at once and add your own.
    - The options follow what you say you do (`src/lib/setup-picks.ts`): trader, founder, engineer, sales and marketing, finance, consultant, product and design, recruiter, job seeker, creator.
    - The defaults are deliberate and come pre-ticked. For example, a trader's never-list starts with *Personalized investment advice* and *Promises of returns*, and everyone's with *Politics*, *Religion* and *Confidential employer information*.
  - **Quick fill from your LinkedIn**: LinkedIn sign-in shares only a name, an email and a photo, so setup asks for the profile itself, in one of two ways:
    - Upload the LinkedIn data export (`.zip` or its CSVs). The browser reads only Profile, Positions, Education, Skills and Shares out of it (`src/lib/zip-lite.ts`); messages and connections never leave the browser.
    - Or paste the text of your profile page.
  - **What Quick fill fills in**, across both steps:
    - what you do, from your headline;
    - facts built only from the export: each role with its employer and years, your education, your location;
    - three of your recent posts, as voice samples;
    - the picks.
  - Claude drafts the picks and reads pasted text when `ANTHROPIC_API_KEY` is set; otherwise rules do the same job. Each run is recorded as usage (`setup` / `quick fill`), with its cost.
  - The voice step now accepts picked style traits in place of posts, for people who haven't posted yet. The writer reads them as `STYLE`, beside the samples. Where samples are set on their own (Settings, the API), two posts are still required.
- **Usage across features** (`/app/admin/usage?feature=`): the operator page switches between Examples and AI history import, with the same totals, 30-day chart, by-action table and most active people for each; the flag card shows only for flagged features, and import adds messages kept and suggestions accepted. A consolidated end-to-end test (`e2e/journey.spec.ts`) takes one person through import, setup, Inputs, X, examples, drafts on both channels, numbers, Results, Settings and usage.
- **Inputs and the nav, consolidated with Settings, import and post numbers**: Inputs also lists your AI history (Increase while import suggestions wait or you have fewer than 5 facts), post numbers (Increase while a LinkedIn post over a day old has none and they aren't read automatically), your name and photo, and your billing plan (when annual is offered). The nav's single Settings entry is your photo, name and the gear, in the Report + edit group; Published moves to Report + edit (you add numbers there); AI history sits under Inputs. Import and Published link back to All inputs.
- **Inputs** (`/app/inputs`): every input you give Cadence on one page, grouped by what it drives (who you are, how you sound, what drafts learn from, how much and when, where it goes). Each one has its editable control, a line on what it is, what it drives and where it lives, a link to its home page, and a **direction** (Maintain, Increase or Decrease) worked out from your results, with the reason and a link to the Results chart or page that shows it. "How this direction is set" spells out each rule; the page opens with the current strategy (from posts a week against your last 4 weeks and engagement).
  - Inputs covered: role, audience, goals, facts, three voice samples, topics, never-write-about, this week's check-in, example ratings (with the `examples` flag), writing model, posts a week, posting days and times, comments a day, comment window and spacing, pause, automatic posting, channels and each channel's drafting switch.
  - One registry (`src/lib/inputs.ts`) lists every input (id, label, what, why, home, editor, direction rule) and holds the rules as pure functions with tests; the page and every home page's **All inputs →** link render from it. Edits go through the same services as the home pages (setup fields through the API's `profilePatch`), so there is one set of rules per input.
  - Setup can be opened at a step (`/onboarding?edit=1&step=2`). Settings' "Your setup" card now points to Inputs.
  - **Demo sample histories**: the demo's "sample history" button (Results, and Inputs while there's no history) offers three stories: *Steady* (the existing 8 weeks), *Ready to grow* (on target 4 weeks running, engagement rising, Mondays strongest: Inputs says increase posts, add a Monday slot, turn on automatic posting) and *Overstretched* (1 post a week against 3, engagement falling, Opus at 86% of the allowance, held and edited drafts, posting paused: Inputs says ease off posts, switch to Sonnet, add facts, topics and samples, resume). A database test checks each story produces those directions.
 (`/app/channels`): connect where your posts go, in one click, with no API keys.
- **Settings, reorganised** (`/app/settings`, the gear at the bottom of the sidebar): titled sections for Account (Profile, Billing), Writing and posting (setup, auto-publish), Connections (LinkedIn, connected assistants, API keys) and the Danger zone (delete account). Nothing was removed. The sidebar shows your photo and name above the gear.
  - **Profile**: change your name (Better Auth `user.name`). Your LinkedIn photo shows by default; upload a replacement (PNG, JPEG or WebP, **2 MB at most**, typed by its bytes) and it's cropped server-side to a 256 × 256 WebP, which also drops camera and location metadata. "Use my LinkedIn photo" goes back. Someone who signed up by email gets their LinkedIn photo as the default once they connect LinkedIn (read from LinkedIn's OpenID profile when the account is linked, only if they have no photo yet; it never overwrites one). Photos are stored in Postgres (`user_avatars`, row-level security, migration 0012) and served only to their owner with `nosniff` and a sandboxing CSP.
  - **Billing**: your plan, price and renewal (or first-charge) date, and **Switch to annual — save 20%** with the math shown (at $20/month: 12 × $20 = $240, billed annually $192/year, saving $48). The switch goes through Better Auth's Stripe plugin (`annualDiscountPriceId`, `subscription.upgrade({ annual: true })`), so Stripe's portal shows the exact amount before you confirm. Offered only when the new optional `STRIPE_ANNUAL_PRICE_ID` is set (see the README's self-hosting steps); demo mode simulates the switch without Stripe. "Manage billing or cancel" still opens the Stripe portal.
- **Import your AI history** (`/app/import`, linked from Settings, and an optional "Bring your AI history" step before setup at `/onboarding/import`): one click for ChatGPT or Claude, with in-app steps for getting each export.
  - Drop the export `.zip` (or the `conversations.json` inside it), up to **1 GB**. The browser sends it in 4 MB chunks with a progress bar; a dropped connection resumes from the last chunk when the same file is chosen again. The first chunk is checked before the rest is sent, so a file that isn't an export is refused at once.
  - The worker reads it as a stream (new `import_history` job): the zip's central directory (stored, deflated, zip64, data descriptors), then each conversations file through zlib and a streaming JSON splitter, one conversation at a time, so memory stays flat. ChatGPT's `conversations.json` and split `conversations-000.json…` files and Claude's `conversations.json` (and per-conversation files) are read by shape; unknown fields, hidden nodes, image parts, code, thinking and tool blocks are skipped, not fatal. Long imports renew their job lease.
  - Only the person's own messages are kept (role user / human, plus their ChatGPT "about you" custom instructions), code removed, capped at 4,000 characters, deduplicated per person across imports. The uploaded file is deleted as soon as it's read; an unfinished upload after 24 hours.
  - **Distilled with Claude under the monthly allowance**: phrase counts over everything kept (free), then a sample of the most self-revealing messages as 800-character excerpts, at most 8 batches of 32,000 characters (map) and one merge (reduce), with Sonnet. A fact counts only if it cites a message the person wrote. If the allowance runs out part-way, what was read is merged locally and the page says so.
  - **Suggestions the person reviews**: facts (only claims made about themselves, with the sentence they came from), topics, voice samples (their own longer passages), never-write-about candidates and post ideas. Nothing is applied without a click; accepting adds to the profile, an idea can be drafted as this week's check-in. The page shows what was found per import (conversations, messages, kept, suggestions) and what it cost.
  - **Delete imported data** removes every import, the messages kept and all suggestions; what was accepted stays in the profile. The privacy policy says what is stored and why.
  - Four new per-user tables with row-level security (migration 0011): `history_imports`, `history_chunks`, `history_messages`, `history_suggestions`. Every step is a usage event (feature `import`: upload, read, distil with cost, accept/dismiss per kind, draft, delete, failures).
  - Demo mode uses a deterministic distiller and small invented sample exports ("Use the sample … export (demo)").
- **Post numbers are saved in Cadence** (`metrics` table, one snapshot per capture or save; the latest shows):
  - **From LinkedIn, automatically**, once the server's LinkedIn app is approved for the Community Management API and `LINKEDIN_ANALYTICS=1`. Cadence asks for `r_member_postAnalytics` at sign-in and reads `memberCreatorPostAnalytics` 1, 3 and 7 days after each post: impressions, members reached, reactions, comments, reposts, saves, sends, link clicks, followers gained and profile views. A refused scope is reported as unavailable (sign in with LinkedIn again); a missing core number fails the capture so it is retried.
  - **By hand, today**: Published has "Add numbers from LinkedIn" on each LinkedIn post (copy them from the post's *View analytics*). Each save is kept as a snapshot.
  - Published shows every number with where it came from ("From LinkedIn" or "Entered by you") and when; Results charts them as before.
- **Channels** (`/app/channels`): connect where your posts go, in one click, with no API keys.
  - **X is the first new channel.** Connect X (OAuth 2.0 with PKCE, through the server's one X app; the token is refreshed automatically). Every LinkedIn draft then gets an **X version**: rewritten to fit one post (280 characters as X counts them, where a link is 23 and most emoji 2), run through the same fact, no-go and repeat checks against X's limits, rewritten once if it misses, and kept as its own draft. Approve, edit, skip and post each version separately. X versions go out in your posting slots like LinkedIn posts; the two channels don't take each other's slots. Results reads X's public numbers (impressions, likes, replies, reposts and quotes).
  - A per-channel switch turns versions off without disconnecting; Disconnect removes the token.
  - **Coming soon** (listed, not connectable yet): Threads, Bluesky, Mastodon, Facebook Pages, Instagram, Pinterest, TikTok, YouTube, Reddit, Google Business Profile.
  - One registry (`src/platforms/registry.ts`) describes every channel: its sign-in provider, the server keys it needs, its length limits and how it counts them, whether it needs media, and its post URLs. Taking a planned channel live is one registry entry, one adapter and one provider; the database already has every channel's value (migration 0010).
  - Drafts and posts in the API carry `platform`.
- **Examples** (`/app/examples`, behind the `examples` feature flag): paste a link to a post or visual, or upload one, and give it a thumbs up or down.
  - Links are fetched by the server with a guard: http(s) on ports 80/443 only, every address checked after DNS at connect time (no private, loopback or link-local addresses), at most 5 redirects each checked again, 10 s timeout. A page's title, author, text and its preview image or video are kept; a direct link to an image, GIF, video or PDF is kept as the file.
  - Uploads: PNG, JPEG, WebP, GIF, MP4, WebM, MOV or PDF, **5 MB at most per file** (link media too). The type is read from the file's bytes, not its name; SVG is refused. Files are served only to their owner, with `nosniff` and a sandboxing CSP.
  - Each example is analysed once (the person's chosen model, against the monthly allowance): format, hook, shape, length, tone, visual and its motion, the close and whether it is engagement bait, strengths, weaknesses and one transferable technique. Technique only, never the topic or wording.
  - **Ratings steer drafting**: up to 8 liked and 8 disliked analyses become a "do more of / avoid" block in each drafting brief (outside the cached system prompt). The draft's "Why this draft" says how many steered it. The page shows what the ratings currently teach.
  - Up to 200 examples per person; past that the oldest unrated one makes room.
- **Feature flags** (`feature_flags` table, `pnpm flag`): off unless on for everyone or the account's email is allow-listed. Demo mode turns every flag on. Nav items for flagged features show only to people who have them.
- **Usage measurement** (`usage_events` table): every add, upload, rating, analysis (with its cost), failure and delete is one row. `/app/admin/usage`, for emails in `CADENCE_ADMINS`, shows the flag's state, people, actions, stored files and size, analysis cost, a 30-day daily chart and the most active accounts.
- **Plan** (`/app/plan`): how much you post and comment, and when, per user.
  - **Posts a week**, 0–21: a stepper shows what one more or one fewer would change before you apply it, across three daily slots (A, B, C). Each slot has its own time and days, and a cell turns one slot on or off for one day. Approved posts go into the next free slot of any slot that's on.
  - **Comments a day**, 0–40, inside a window you set and at least N minutes apart. One more goes in the widest gap, never on the hour; one fewer comes out of the most crowded spot; "Space them evenly" re-spaces them. These are plans for the optional Cadence runner and nothing runs them yet.
  - **Your day**: every post slot and comment run on one timeline. Drag one, or use the arrow keys, to move just that one. Quiet hours (22:00–06:00) are never used.
  - **Pause**: approved posts keep their place and wait; Post now is refused until you resume.
  - Built on the LinkedIn engine's volume planner (`src/engine/plan.ts`, ported with its tests) and three new per-user tables with row-level security: `schedules`, `holds`, `engine_settings`.
- The signed-in app has a sidebar grouped by what you do on each page: **Act** (This week, and Inputs with Plan, Channels and Examples under it), **Report** (Published, Results), and **Report + edit** (Settings, pinned to the bottom with the account items). Each group has its own colour bar, icon and label (never colour alone), a key, and each page shows its group's chip above its title. On a phone it is two short labelled rows, with Settings as a gear beside the wordmark; Plan, Channels and Examples are reached from Inputs.
- **Sign up and sign in with email.** The login page offers an emailed link (Better Auth magic link, sent through Resend) before "Continue with LinkedIn". The link opens a confirm page, so a mail scanner can't use it up; it works once, expires in 15 minutes, and the token is stored hashed. Offered only when `RESEND_API_KEY` and `EMAIL_FROM` are set (always in demo mode, where the email is printed).
- **Sign-in check** (`pnpm signin:check`, `deploy/check-env.sh`, start-up log): one line per sign-in setting, never a value: `BETTER_AUTH_URL` (https, and its host is `DOMAIN`), `BETTER_AUTH_SECRET`, LinkedIn keys, Resend and `EMAIL_FROM`, at least one way in, and Stripe for the trial step.
- **`pnpm signin:link you@example.com [--comp]`**: the owner can always get in. It prints a one-time sign-in link made on the server (no email provider or LinkedIn app needed); `--comp` adds a complimentary plan so the account skips the Stripe trial step.
- **Connect LinkedIn from inside the app.** Email accounts connect LinkedIn (needed to publish) from a banner on This week or from Settings, through account linking; the same button renews an expiring connection.
- **Cadence for iOS** (`ios/`): SwiftUI app for iOS 26+ with OAuth sign-in (dynamic registration, PKCE, refresh), This week, draft detail with the "why" sheet, edit, approve (confirms the exact text), skip, check-in with on-device voice (SpeechAnalyzer), Results in Swift Charts, Settings with account deletion, US web-checkout link-out and web setup in the same secure browser session, push registration and routing, and a "This week" widget.
- CadenceKit Swift package: API client generated from `docs/openapi.json` by Apple's swift-openapi-generator; unit tests for PKCE (RFC 7636 vector), callback state, refresh single-flight, revocation and form encoding.
- API operations have stable `operationId`s (`getMe`, `approveDraft`, …).
- iOS CI workflow (path-filtered), App Store submission pack (`docs/ios-app-store.md`), privacy manifest.

### Fixed
- Connecting LinkedIn (or X) from inside the app no longer fails when that account's email differs from your Cadence email.
- A missing or placeholder LinkedIn client ID (e.g. `preview`) no longer sends people to LinkedIn's error page ("The passed in client_id is invalid"). LinkedIn sign-in and Connect are hidden, with a plain note, until real keys are set; the server logs what to fix at start, and `deploy/deploy.sh` refuses to deploy with a placeholder (`deploy/check-env.sh`).
- Sign-in names the app being connected instead of "your AI assistant".
- When nobody can sign in, `/login` names the settings to add (`LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET` or `RESEND_API_KEY, EMAIL_FROM`) instead of a generic note.
- `deploy/deploy.sh` no longer refuses to deploy over a placeholder LinkedIn ID. That kept the older build, the one that sends people to LinkedIn's error page, running. It now warns, and stops only for settings that break sign-in for everyone (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`).

### Changed
- Setup's posting rhythm becomes slot A on Plan for existing users, the first time Plan or an approval needs it. Editing the rhythm in setup resets slot A to it and turns the other slots off. `profile.cadence` in the API is now a summary of the posting slots.

## [0.6.0] - 2026-09-27

Server support for the iOS app (the app itself follows).

### Added
- The REST API accepts OAuth access tokens issued for `/api/v1` (the iOS app's sign-in: native client, custom-scheme redirect, PKCE, refresh tokens), alongside API keys. Tokens for the API and the MCP server don't cross.
- One bearer verifier and one per-user rate limit for the API and the MCP server (`src/lib/bearer.ts`).
- Push notifications (APNs via `apns2`; recorded in demo mode): drafts ready or held, posted, check-in reminder and connection expiring. Push first, email as the fallback for reminders. Notifications never approve anything.
- `POST/DELETE /devices`, `GET /billing/checkout-link` (refuses when a plan is active), `DELETE /account`.
- Account deletion in web Settings and the API: cancels an active web subscription, then deletes everything; a test checks no row survives in any table.
- Sign in with Apple (on when configured; connect LinkedIn afterwards).
- App Review access: `pnpm reviewer:create` makes the only email/password account (public sign-up stays off); its posts go to the recording publisher and never reach LinkedIn. "App Review sign-in" link on the sign-in page.
- Sign-in keeps a `next` destination (e.g. checkout from the iOS app) and checkout can return to the app.

## [0.5.0] - 2026-09-27

### Added
- MCP server at `/api/mcp` (Streamable HTTP via `mcp-handler` 2 / MCP SDK v2) with 9 tools (status, setup, list and get drafts with the "why", results, save check-in, edit, skip, approve) and a `weekly_checkin` prompt. Tool annotations mark read-only and destructive tools; there is no publish-now tool.
- OAuth 2.1 authorization server for assistants (`@better-auth/oauth-provider` + JWT): dynamic client registration, PKCE, RFC 9728 and RFC 8414 metadata, tokens bound to the MCP resource, a consent screen with an optional, unticked-by-default approve scope.
- API keys also work as MCP bearer tokens (for Claude Code and Codex CLI).
- `/integrations` page: Claude connector steps, Claude Code command, Codex config, one-click Cursor and VS Code installs.
- Settings → Connected assistants with Disconnect, which takes effect immediately.
- Per-user MCP rate limit (60/min), 402 without a plan.
- `docs/MCP.md` and a Claude directory submission pack (`docs/claude-directory.md`).
- An end-to-end test of the whole assistant connection (`e2e/mcp.spec.ts`).

### Fixed
- Consent buttons are disabled until the page is interactive, so an early click can't be silently lost.
- The e2e onboarding steps wait for each step to render (a race that made the smoke test flaky).

## [0.4.0] - 2026-09-27

### Added
- Public REST API at `/api/v1`, described with OpenAPI 3.1 generated from the route definitions (`@hono/zod-openapi`); interactive reference at `/docs/api` (Scalar); spec committed at `docs/openapi.json` and checked in CI.
- API keys in Settings with `read`, `write` and a separately granted `approve` scope; 60 requests/minute per key with `RateLimit-*` headers and `429` + `Retry-After`; 20 check-ins/day; `402` without an active plan; RFC 9457 errors.
- `cadence-posts` CLI: login, status, checkin (args or stdin), drafts, show, why, edit, approve (confirms first), skip, stats.
- API terms and disclaimers (terms page, docs, spec). No endpoint can publish immediately.
- A shared service layer (`src/services`) used by the web app, the API and (next) the MCP server.

## [0.3.0] - 2026-09-27

### Added
- Results page with four readable charts: posts per week against your target (outreach), consistency stats, reach and engagement per post with a 4-post average and your best post (impact), and engagement by angle, weekday and length (what works). Each has a "how to read this" line and a table view.
- A this-week summary on This week (posts vs target, streak).
- Results capture: a routine records each post's numbers 24 h and 72 h after it goes out, through the platform adapter. Demo mode records clearly labelled sample numbers; for real users it switches on when LinkedIn approves analytics.
- Demo-only "8 weeks of sample history" so the charts can be explored.
- `src/services/stats.ts`, shared by the page and (next) the API and MCP server.

## [0.2.0] - 2026-09-27

### Added
- Drafting: a weekly check-in becomes one post per posting slot, with 2 variants each written by Claude (Sonnet 5 default, Opus 5 optional). The better variant is kept.
- Checks on every draft: LinkedIn formatting, opening line, stock phrases, length, the fact check against your own facts, the never-write-about list, and repeats of recent posts. Every check's result is shown in "Why this draft".
- Approve, edit, skip and post now. Scheduling into your slots in your time zone; only the exact approved text can publish.
- Publishing through LinkedIn's Posts API, exactly once. A crash mid-publish marks the post for review and never retries it.
- Worker service with a Postgres job queue, check-in and connection-expiry reminders, and a $5/user/month model cost cap.
- Automatic posting, unlocked after 5 clean approvals.
- Published page; settings for model use, the connection and automatic posting.
- Demo mode (`pnpm demo`): the whole product with no keys, on localhost or in CI only.
- Demo video recorded from the app (`pnpm demo:record`), `/demo` and `/how-it-works` pages, and docs/DEMO.md.
- SEO and AI-SEO: metadata, Open Graph image, sitemap, robots, JSON-LD (SoftwareApplication, FAQPage, VideoObject), `/llms.txt` and `/llms-full.txt`.
- One catalog (`src/lib/catalog.ts`) drives the engine's thresholds, the site, llms.txt and the README tables; CI checks the README is current.
- MIT licence, contributing guide, code of conduct, security policy, issue and PR templates, Dependabot, release workflow.

### Fixed
- Onboarding failed at runtime because a server-actions file exported its validation schemas.
- Link-styled buttons now keep link semantics.

## [0.1.0] - 2026-09-27

### Added
- Sign in with LinkedIn, Stripe checkout with a 7-day trial, billing portal.
- Three-step guided setup, weekly check-in, settings.
- Postgres schema with row-level security on every tenant table; generated ERD in ARCHITECTURE.md.

[Unreleased]: https://github.com/MAKaminski/cadence/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/MAKaminski/cadence/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/MAKaminski/cadence/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MAKaminski/cadence/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MAKaminski/cadence/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MAKaminski/cadence/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MAKaminski/cadence/releases/tag/v0.1.0
