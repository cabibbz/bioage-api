# Contributing

## Documentation Contract

Every material code change must update the docs that describe it.

Minimum expectation:

- update `docs/progress-log.md`
- update `docs/compact/PROJECT_SNAPSHOT.md` if current state or next moves changed
- update `docs/architecture.md` if boundaries or flows changed
- update `docs/domain-model.md` if storage or canonical concepts changed
- add or update an ADR in `docs/decisions/` when a lasting decision changes

Before handoff, run:

```bash
npm run verify:meta
```

## Testing Contract

Every session handoff should include genuine function testing, not just static checks.

Minimum expectation:

- run docs verification
- run typecheck
- run production build
- run the file-backed functional suite
- run the file-backed browser UI suite
- run the Postgres functional suite too whenever `DATABASE_URL` is configured
- run the backend parity suite too whenever `DATABASE_URL` is configured

If Postgres is available for the session, the session is not complete until the Postgres path has been exercised.

Once a full functionality update is confirmed by `npm run verify:meta` and any required Postgres checks, commit it and push it to GitHub in the same pass. Do not leave fully verified functionality sitting only in the local worktree.
`npm run verify:meta` must also leave the git worktree unchanged relative to how it started.

## Compaction Rule

This repo must stay recoverable even if project context is compressed to roughly 10% of its original volume.

That means:

- `docs/compact/PROJECT_SNAPSHOT.md` must stay short and high signal keeping meaning and important info
- the snapshot must tell a new contributor what exists, what is fragile, and what to do next
- long explanation belongs in architecture or ADR docs, not the compact handoff

If a future contributor could not safely resume from the compact snapshot plus the file tree, the docs are not good enough.

## Change Workflow

1. Make the code change.
2. Update the relevant docs in the same pass.
3. Run `npm run verify:meta`.
4. Commit and push the verified change to GitHub.
5. Hand off with current risks and next moves called out explicitly.

## Scope Rule

Prefer changes that deepen the product wedge:

- report ingestion
- normalization
- provenance
- longitudinal review
- intervention tracking

Avoid broad platform sprawl unless the current wedge is already solid.
