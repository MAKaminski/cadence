# Contributing to Cadence

Thanks for helping. The quickest way in is to run the demo, which needs no keys:

```bash
pnpm install && pnpm demo
```

## Ideas and questions
Use [Discussions → Ideas](https://github.com/MAKaminski/cadence/discussions/categories/ideas) for feature ideas; the most-upvoted ones shape the roadmap. Use [Issues](https://github.com/MAKaminski/cadence/issues) for bugs.

## Pull requests
1. Open an issue or discussion first for anything larger than a small fix.
2. Keep to the existing patterns in [ARCHITECTURE.md](ARCHITECTURE.md): tenant queries go through `asUser()`, mutations are zod-validated server actions, and outside services sit behind an interface with a demo implementation.
3. Change thresholds and routines only in `src/lib/catalog.ts`, then run `pnpm catalog`.
4. For schema changes, edit `src/db/*.ts`, run `pnpm db:generate` and `pnpm arch`, and commit the migration and the ERD.
5. Before pushing, run: typecheck, lint, the unit tests (`pnpm test`), `pnpm scrub`, `pnpm arch:check` and `pnpm catalog:check`. CI runs the same checks, plus the Playwright demo smoke test.
6. Add a line under `[Unreleased]` in CHANGELOG.md.

Never commit secrets or real personal data. Fixtures use the fictional persona in `src/lib/demo-persona.ts`.

By contributing you agree that your work is released under the MIT licence and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
