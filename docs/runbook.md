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
- the committed functional suite now resets state between scenarios and exercises every API route plus every registered parser/review classification
- the functional suite now discovers exported API route methods under `app/api` and fails if any route lacks a claiming scenario
- parser selection now comes from a shared contract at `src/lib/parsing/parser-contract.json`, and the functional suite fails if that contract grows without new fixtures
- the suite now also exercises missing-resource route behavior, invalid promotion states, and deterministic parser failure handling
- after each scenario it also verifies storage and graph integrity: binary files match metadata, and parse/review/promotion records reference valid upstream entities

## Verification

Before handoff:

```bash
npm run verify:meta
```

This runs:

- docs verification
- TypeScript validation
- production build
- SQL seed drift check against `db/seed-from-store.sql` without rewriting the tracked file
- a post-run git-status guard so `npm run verify:meta` fails if verification changes the worktree relative to its starting state
- committed file-backed functional coverage across route validation, report intake, intervention intake, review, promotion, and every document/parser classification
- committed file-backed browser coverage across document upload, review, promotion, report normalization, and intervention workbenches on `/`
- a UI inventory guard that fails if `/` gains a new interactive workbench without an exercised browser path
- dashboard read-panel coverage that asserts the signal board, source documents, parse tasks, timeline, and clinician-prep surfaces update or remain visible through the UI flow
- live browser assertions that compare dashboard counters and signal-board titles against the patient API snapshot after each workflow step
- Postgres bootstrap plus the same functional suite when `DATABASE_URL` is configured
- backend parity verification that reruns the same scenarios against file and Postgres then compares normalized persisted state when `DATABASE_URL` is configured

For the functional suite only:

```bash
npm run test:functional
```

Legacy `npm run test:integration*` aliases still call the same suite.

For backend parity only:

```bash
npm run test:functional:parity
```

For browser-driven UI coverage only:

```bash
npm run test:ui:file
```

The UI script installs Playwright Chromium automatically on first run if it is missing.

To export the current JSON seed into SQL inserts for the Postgres target:

```bash
npm run seed:postgres:export
```

This writes:

- `db/seed-from-store.sql`

For a non-mutating drift check instead:

```bash
npm run seed:postgres:check
```

For a manual local Postgres bootstrap:

1. apply `db/postgres-schema.sql`
2. run `npm run seed:postgres:export`
3. apply `db/seed-from-store.sql`
4. start the app with `PERSISTENCE_BACKEND=postgres`

For a repo-driven bootstrap against a configured database:

```bash
npm run seed:postgres:export
npm run bootstrap:postgres
npm run test:functional:postgres
```

`npm run test:functional:postgres` resets the app tables before every scenario, so use a disposable dev database.

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
- the Postgres functional suite is destructive against the app tables in the configured database
- PDF, image, HTML, and XLS/XLSX formats remain review-only
- ZIP ingestion does not yet recurse into nested archives
- the functional suite still verifies API behavior, not browser UI interaction fidelity
- backend parity is only checked when `DATABASE_URL` is configured
- the committed browser suite currently covers the file-backed path only
