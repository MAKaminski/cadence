# Cadence

LinkedIn posts in your own voice, from two minutes a week. Users tell Cadence who they are once, check in
weekly, and approve drafts; Cadence publishes approved posts through LinkedIn's official API.

- $20/month after a 7-day free trial (Stripe).
- Sign in with LinkedIn; the same consent lets Cadence publish posts the user approves.
- Drafts are written by Claude (Sonnet 5 by default, Opus 5 optional) and only state facts the user supplied.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together.

## Develop

```bash
docker run -d --name cadence-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=cadence -p 55432:5432 postgres:17
```

Set the variables listed in `src/lib/env.ts` in your shell (never commit them), then:

```bash
pnpm install && pnpm db:migrate && pnpm dev
```

Tests need a migrated database in `TEST_DATABASE_URL`; the row-level-security suite skips without one.

Before pushing, `pnpm scrub` checks that nothing personal or secret is in the tree; set
`CADENCE_PRIVATE_TERMS` to a file outside the repo to add your own terms.
