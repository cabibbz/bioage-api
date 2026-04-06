# Longevity Evidence Layer

Clinic-facing preventive-health software that turns uploaded reports and wearable feeds into a source-preserving longitudinal evidence record.

## What is in this first slice

- Next.js app scaffold
- clinician dashboard shell
- seeded patient timeline
- vendor metric normalization catalog
- report intake API stub
- upload workbench for testing mappings
- parser-task queue with deterministic summaries
- clinician review-decision layer
- measurement-promotion layer for accepted numeric decisions
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

For the committed end-to-end smoke check only:

```bash
npm run test:integration
```

For backend-specific smoke checks:

```bash
npm run test:integration:file
npm run test:integration:postgres
```

`npm run test:integration:postgres` resets the app tables in the configured database first, so only point it at a disposable dev database.

The docs contract lives in `CONTRIBUTING.md`.

The compact handoff file for severe context compression lives at `docs/compact/PROJECT_SNAPSHOT.md`.

The concrete next-step database target lives at `db/postgres-schema.sql`.

The current JSON seed can be exported into SQL inserts with `npm run seed:postgres:export`.

To run against Postgres instead of the file store, set `PERSISTENCE_BACKEND=postgres` and `DATABASE_URL` before starting the app.

To apply the schema plus seed into a target database from the repo, run `npm run bootstrap:postgres`.

## First milestones

1. Validate the Postgres backend against a live local database and add a Postgres smoke path.
2. Add object storage for source reports.
3. Add promotion for accepted text and categorical review decisions.
4. Add Terra wearable ingestion.
5. Add one EHR / practice integration.
