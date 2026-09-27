# Changelog

All notable changes to Cadence. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/MAKaminski/cadence/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/MAKaminski/cadence/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MAKaminski/cadence/releases/tag/v0.1.0
