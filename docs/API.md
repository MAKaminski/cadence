# Cadence API

Drive Cadence from scripts, the [CLI](../cli/README.md) or your own tools. The API is described with **OpenAPI 3.1**: the spec is [`docs/openapi.json`](openapi.json), generated from the route definitions (CI fails if it drifts), and every Cadence server serves an interactive reference at **`/docs/api`**.

## Quick start

1. In the app, open **Settings → API keys** and create a key. Choose its scopes (below). The key is shown once.
2. Call the API:

```bash
curl -s https://YOUR-CADENCE-HOST/api/v1/me -H "Authorization: Bearer $CADENCE_API_KEY"

curl -s -X POST https://YOUR-CADENCE-HOST/api/v1/checkins \
  -H "Authorization: Bearer $CADENCE_API_KEY" -H "Content-Type: application/json" \
  -d '{"body":"Shipped the pricing test; annual-first converted better. A customer asked about SOC 2 timing."}'

curl -s "https://YOUR-CADENCE-HOST/api/v1/drafts?status=draft,held" -H "Authorization: Bearer $CADENCE_API_KEY"
```

Locally, `pnpm demo` serves everything at `http://localhost:3000` with no outside keys.

## Endpoints

| Method | Path | Scope | What it does |
|---|---|---|---|
| GET | `/api/v1/me` | read | Account, plan, model use this month, LinkedIn connection, the key's scopes |
| GET | `/api/v1/profile` | read | Your one-time setup |
| PATCH | `/api/v1/profile` | write | Change any part of the setup (facts, topics, cadence, model…) |
| POST | `/api/v1/checkins` | write | Save a check-in; drafting starts right away (202) |
| GET | `/api/v1/drafts?status=` | read | Drafts, newest first, and whether drafting is still running |
| GET | `/api/v1/drafts/{id}` | read | One draft with `why`: the angle, every check, what changed, model and cost |
| PATCH | `/api/v1/drafts/{id}` | write | Edit. Re-checked, never rewritten; must be approved again |
| POST | `/api/v1/drafts/{id}/approve` | **approve** | Lock the text and schedule it into your next slot |
| POST | `/api/v1/drafts/{id}/skip` | write | Skip |
| GET | `/api/v1/publications` | read | What was posted, with the latest numbers |
| GET | `/api/v1/stats/outreach?weeks=` | read | Posts per week vs your target |
| GET | `/api/v1/stats/impact` | read | Per-post reach and engagement, and engagement by angle, weekday and length |

**There is deliberately no "publish now" endpoint.** Approved posts go out on your schedule, once.

## Scopes

| Scope | Allows |
|---|---|
| `read` | Everything under GET. Always included |
| `write` | Check-ins, edits, skips, setup changes |
| `approve` | Approving drafts, which schedules them to post. Off by default; grant it only to tools you'd trust to post for you |

## Limits

| Limit | Value | How you see it |
|---|---|---|
| Requests per key | 60 per minute | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on every response; `429` with `Retry-After` when exceeded |
| Check-ins | 20 per day per account | `429` |
| Model use | $5 per account per month (drafting pauses, then resumes on the 1st) | `GET /me` → `modelUseThisMonthUsd` |
| Posting | Your posts-per-week setting (max 5) and your posting days | Scheduling |

Limits may change with 30 days' notice in the [changelog](../CHANGELOG.md).

## Errors

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details (`application/problem+json`): `{ type, title, status, detail }`.

| Status | Title | Meaning |
|---|---|---|
| 401 | <a id="unauthorized"></a>Unauthorized | Missing, invalid, expired or revoked key |
| 402 | <a id="subscription-required"></a>Subscription required | The account has no active trial or subscription |
| 403 | <a id="missing-scope"></a>Missing scope | The key lacks the scope this endpoint needs |
| 404 | <a id="not-found"></a>Not found | No such draft (or it belongs to someone else) |
| 409 | <a id="conflict"></a>Conflict | The draft is in a state that doesn't allow this (e.g. already posted) |
| 422 | <a id="invalid-request"></a>Invalid request | Validation failed; `detail` names the field |
| 429 | <a id="too-many-requests"></a>Too many requests | Rate limited; wait `Retry-After` seconds |

## Idempotency

You don't need idempotency keys: approving is a state change (approving twice returns a conflict), a draft can have only one publication, and edits are versioned. Retrying a check-in creates a second check-in, so retry only on network errors with no response.

## Versioning

The path carries the major version (`/api/v1`). Additive changes (new fields, endpoints) can happen any time; breaking changes mean `/api/v2`, with `/api/v1` kept for at least 6 months after.

## Disclaimer

Cadence is not affiliated with, endorsed by or sponsored by LinkedIn. You are responsible for everything published from your account. Drafts are written by AI and can be wrong; approving a draft is your review of it. The API cannot comment, message, send connection requests or act on LinkedIn beyond publishing posts you approved, on your schedule. Keys used abusively are revoked. See the [terms](https://github.com/MAKaminski/cadence/blob/main/src/app/terms/page.tsx).
