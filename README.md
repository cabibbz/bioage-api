# Longevity Evidence Layer

Clinic-facing preventive-health software that turns uploaded reports and wearable feeds into a source-preserving longitudinal evidence record.

## What is in this first slice

- Next.js app scaffold
- clinician dashboard shell
- seeded patient timeline
- Tier 1 longevity normalization catalog with category, LOINC, range, and alias metadata
- report intake API stub
- upload workbench for testing mappings
- parser-task queue with deterministic summaries
- clinician review-decision layer
- measurement-promotion layer for accepted reviewed decisions
- repository abstraction with a file-backed default backend and implemented Postgres backend
- binary-storage abstraction with a local default backend and object-storage target

## Product direction

This codebase starts from a narrow wedge:

- ingest biological-age and preventive-health reports
- normalize them into canonical concepts
- preserve provenance
- surface conflicts across modalities
- track interventions over time

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Documentation

Run the full project guardrail before handing off work:

```bash
npm run verify:meta
```

After a full functionality update passes `npm run verify:meta` and any required Postgres checks, commit it and push it before handoff.

For the committed route- and parser-matrix functional suite:

```bash
npm run test:functional
```

The legacy `test:integration*` commands still point at the same suite.

For backend-specific functional checks:

```bash
npm run test:functional:file
npm run test:functional:postgres
npm run test:functional:parity
npm run test:ui:file
```

`npm run test:functional:postgres` resets the app tables in the configured database before each scenario, so only point it at a disposable dev database.
`npm run test:functional:parity` reruns the same functional scenarios against both backends and compares normalized persisted state.
`npm run test:ui:file` drives Chromium through the clinician workbenches on `/` and verifies the persisted page state after each step. If no Playwright browser is installed yet, the script installs Chromium automatically on first run.

The docs contract lives in `CONTRIBUTING.md`.

The compact handoff file for severe context compression lives at `docs/compact/PROJECT_SNAPSHOT.md`.

The concrete next-step database target lives at `db/postgres-schema.sql`.

The current JSON seed can be exported into SQL inserts with `npm run seed:postgres:export`.

To run against Postgres instead of the file store, set `PERSISTENCE_BACKEND=postgres` and `DATABASE_URL` before starting the app.

To apply the schema plus seed into a target database from the repo, run `npm run bootstrap:postgres`.

## First milestones

1. Validate the Postgres backend against a live local database and keep the Postgres functional path green.
2. Add object storage for source reports.
3. Broaden direct report intake plus interpretation beyond numeric-only entries.
4. Add Terra wearable ingestion.
5. Add one EHR / practice integration.
