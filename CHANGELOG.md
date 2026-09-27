# Changelog

All notable changes to Cadence. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/MAKaminski/cadence/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/MAKaminski/cadence/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MAKaminski/cadence/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MAKaminski/cadence/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MAKaminski/cadence/releases/tag/v0.1.0
