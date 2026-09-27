# Changelog

All notable changes to Cadence. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
