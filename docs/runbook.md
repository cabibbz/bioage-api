# Runbook

## Local Workflow

Install and run:

```bash
npm install
npm run dev
```

The seeded patient comes from `data/store.json`.

The active backend defaults to the file repository. A Postgres backend now exists behind `PERSISTENCE_BACKEND=postgres` and requires `DATABASE_URL` plus the schema in `db/postgres-schema.sql`.
Document binaries still default to local filesystem storage. `DOCUMENT_STORAGE_BACKEND=object` remains a stub behind the adapter.

The main demo actions on `/` are:

- the source-document workbench, which posts into `/api/intake/document`
- the report upload workbench, which posts into `/api/intake/report`
- the intervention workbench, which posts into `/api/intake/intervention`

For repeatable local verification, use the APIs directly against a running server:

- `GET /api/patients/pt_001`
- `POST /api/intake/document`
- `POST /api/intake/report`
- `POST /api/intake/intervention`

Recent verified flows:

- report ingestion updates measurements and timeline state
- intervention intake updates timeline state
- ZIP source-document upload stores a parent document, extracts supported child documents, and updates timeline state
- a ZIP containing JSON, CSV, and TXT files produced one parent archive document and three extracted child documents
- document intake now also creates parser tasks for parent and extracted child documents
- deterministic parsers summarize FHIR JSON, generic JSON, CSV, TXT, C-CDA structure, and ZIP manifests
- a live parser probe produced four completed parse tasks with parsers `archive_manifest`, `fhir_bundle`, `csv_table`, and `text_note`
- clinician review decisions can now be posted into `/api/review/decision` and are stored separately from canonical measurements
- a live review probe accepted a FHIR candidate, increased stored review decisions from `0` to `1`, and increased timeline events from `4` to `6`
- accepted numeric review decisions can now be promoted through `/api/review/promote`
- a live promotion probe promoted a reviewed CSV ApoB candidate and increased stored measurements from `4` to `5`

## Verification

Before handoff:

```bash
npm run verify:meta
```

This runs:

- docs verification
- TypeScript validation
- production build
- SQL seed export
- committed file-backed smoke flow across report intake, intervention intake, document intake, review, and promotion
- Postgres bootstrap plus Postgres smoke flow when `DATABASE_URL` is configured

For the smoke flow only:

```bash
npm run test:integration
```

To export the current JSON seed into SQL inserts for the Postgres target:

```bash
npm run seed:postgres:export
```

This writes:

- `db/seed-from-store.sql`

For a manual local Postgres bootstrap:

1. apply `db/postgres-schema.sql`
2. run `npm run seed:postgres:export`
3. apply `db/seed-from-store.sql`
4. start the app with `PERSISTENCE_BACKEND=postgres`

For a repo-driven bootstrap against a configured database:

```bash
npm run seed:postgres:export
npm run bootstrap:postgres
npm run test:integration:postgres
```

`npm run test:integration:postgres` resets the app tables before reseeding, so use a disposable dev database.

## Known Gaps

- file-backed storage is single-process and not concurrency-safe
- local binary writes can orphan files if a later database write fails
- no auth or HIPAA controls yet
- no migration framework yet
- intervention events are not yet connected to outcome windows
- only numeric accepted decisions are promotable in v1
- object storage is still a stub behind the storage adapter
- full session verification only exercises Postgres when `DATABASE_URL` is configured
- the bootstrap script is additive only and does not reset a database
- the Postgres smoke test is destructive against the app tables in the configured database
- PDF, image, HTML, and XLS/XLSX formats remain review-only
- ZIP ingestion does not yet recurse into nested archives
