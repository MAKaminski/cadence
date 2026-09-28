# Claude directory submission pack

Everything needed to submit Cadence to Anthropic's connector directory. **Submission is done by the account owner** through Anthropic's submission form, found via Anthropic's MCP directory documentation. Check the form for its current requirements before submitting; this pack covers what directory reviews commonly ask for.

## Prerequisites (status)

| Requirement | Status |
|---|---|
| Public HTTPS MCP endpoint | Waiting on the public deploy (`https://<domain>/api/mcp`) |
| OAuth 2.1 with PKCE, dynamic client registration, RFC 9728 protected resource metadata | Done (v0.5.0); tested in `e2e/mcp.spec.ts` |
| Tool annotations (read-only / destructive hints) on every tool | Done |
| Least privilege: separate optional scope for the one consequential action | Done (`cadence:approve`, unticked by default) |
| No irreversible action without the user | Done: no publish-now tool; approval schedules and can be undone with `skip_draft` before the slot |
| Privacy policy and terms URLs | `/privacy`, `/terms#api` (drafts; have them reviewed before launch) |
| Support contact | GitHub issues: https://github.com/MAKaminski/cadence/issues |
| Test account for reviewers | Create after deploy: a trial account with sample history; share credentials only through the submission form |

## Listing copy

**Name:** Cadence

**One line:** LinkedIn posts in your own voice, from a two-minute weekly check-in.

**Description:** Cadence turns your weekly notes into LinkedIn posts that sound like you, checks every draft against facts you supplied, and publishes the ones you approve on your schedule through LinkedIn's official API. With the Cadence connector, Claude can run your weekly check-in as a short conversation, walk you through each draft and exactly why it reads the way it does (every check, what was fixed or held), edit or skip drafts, show your outreach and impact, and, only if you allow it, approve drafts for your next posting slot.

**Example prompts:**
- "Let's do my Cadence check-in."
- "What drafts are waiting, and why was the second one held?"
- "Tighten the opening line of that draft and show me the new version."
- "How did my posts do this month? What's working?"

**Categories:** Productivity, Marketing, Writing

**Tools:** see the table in [MCP.md](MCP.md).

## Logo

`public/brand/cadence-logo-400.png` (400×400) and `cadence-logo-100.png`.
