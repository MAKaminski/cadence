# Cadence MCP server

Cadence is a remote [Model Context Protocol](https://modelcontextprotocol.io) server at **`https://YOUR-CADENCE-HOST/api/mcp`** (Streamable HTTP; `mcp-handler` 2 on the MCP SDK v2, which serves the 2026-07-28 spec and 2025-era clients from one endpoint). It lets an assistant run your weekly Cadence loop in conversation: interview you, save the check-in, walk through the drafts and why each reads the way it does, and show results.

Install buttons and copy-paste commands for every client are on **`/integrations`** of any Cadence server.

## Connecting

| Client | How |
|---|---|
| Claude (web, desktop) | Settings → Connectors → Add custom connector → paste the URL; sign in to Cadence and consent |
| Claude Code | `claude mcp add --transport http cadence https://YOUR-CADENCE-HOST/api/mcp`, then `/mcp` to sign in |
| Codex | `~/.codex/config.toml`: `[mcp_servers.cadence]` with `url = "https://YOUR-CADENCE-HOST/api/mcp"` |
| Cursor, VS Code | The one-click buttons on `/integrations` |
| Any client with headers | `Authorization: Bearer cad_…` using an API key from Settings (scopes map to `cadence:*`) |

## Auth

OAuth 2.1 with PKCE, from Better Auth's `@better-auth/oauth-provider`:

1. `POST /api/mcp` without a token → `401` with `WWW-Authenticate: Bearer … resource_metadata="…/.well-known/oauth-protected-resource"` (RFC 9728).
2. Protected resource metadata names the authorization server `…/api/auth`, whose RFC 8414 metadata is at `/.well-known/oauth-authorization-server/api/auth`.
3. Clients register themselves (RFC 7591 dynamic registration, open). Clients whose redirect URIs are all http loopback are registered as native apps (RFC 8252).
4. The user signs in and sees a consent screen listing `cadence:read` (required), `cadence:write` and `cadence:approve` (unticked by default).
5. Access tokens are JWTs with audience `…/api/mcp` (RFC 8707). Every call also checks the user's consent still exists, so **Disconnect** in Settings takes effect immediately.

An account without an active trial or subscription gets `402`.

## Tools

| Tool | Scope | Annotations | Does |
|---|---|---|---|
| `get_status` | read | read-only | Plan, LinkedIn connection, model use, posts this week vs target |
| `get_setup` | read | read-only | Role, audience, goals, facts, topics, never-write-about list, rhythm, model |
| `list_drafts` | read | read-only | Drafts waiting (draft or held) and scheduled |
| `get_draft` | read | read-only | One draft with its full "why": angle, checks, changes, model, cost |
| `get_results` | read | read-only | Outreach per week, impact per post, what works |
| `save_checkin` | write | | Save the week's notes; drafting starts |
| `edit_draft` | write | | Replace a draft's text; re-checked, needs approving again |
| `skip_draft` | write | destructive | Drop a draft |
| `approve_draft` | approve | destructive, open-world | Schedule the exact text for the next slot. The description tells the assistant to show the user the text and get an explicit yes |

Prompt: `weekly_checkin`, a two-minute interview that ends in `save_checkin`.

**There is no tool that posts immediately**, and nothing an assistant does can skip the user's schedule.

## Limits

OAuth endpoints are rate limited per IP by Better Auth: client registration 5 a minute, authorize 30, token 20 (`429` with `x-retry-after`). Tool calls: 60 per minute per user (the same budget as an API key), 20 check-ins a day, and model use capped by the plan. Over the limit returns `429` with `Retry-After`.

## Testing

`e2e/mcp.spec.ts` runs the whole flow against `pnpm demo`: discovery, registration, sign-in, consent without approve, token exchange, every tool through the official MCP client, the approve scope refused, an API key with approve succeeding, disconnect cutting access, and a foreign token rejected. By hand: `npx @modelcontextprotocol/inspector` against `http://localhost:3000/api/mcp`.
