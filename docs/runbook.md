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
- mutation response contracts that compare every successful `patientSnapshot` summary against the persisted patient state
- patient-route contract checks that compare `GET /api/patients/[patientId]` directly against the persisted backend snapshot after every functional scenario
- route-breadth inventory rules that require every discovered API route method to have both a success path and an error path in the functional suite
- trim-aware required-field validation coverage so blank or whitespace-only request fields fail with the documented `400` responses
- committed file-backed browser coverage across document upload, review, promotion, report normalization, and intervention workbenches on `/`
- a UI inventory guard that fails if `/` gains a new interactive workbench without an exercised browser path
- browser workbench coverage now requires both a successful path and an invalid-action path for every discovered interactive workbench
- dashboard read-panel coverage that asserts the signal board, source documents, parse tasks, timeline, and clinician-prep surfaces update or remain visible through the UI flow
- live browser assertions that compare dashboard counters and signal-board titles against the persisted backend snapshot after each workflow step and prove failed UI actions do not mutate persisted state
- the document workbench now returns a stable client-side error for blank source-system input and the review workbench does the same for blank reviewer input, and the browser suite verifies both local guards
- the document workbench reset path now restores the default source-system and clears the actual file input, and the browser suite verifies that reset behavior before continuing the upload flow
- the browser suite now verifies reset behavior across every workbench: document clears the real file input, review restores the current candidate state, promotion restores the first pending decision, and report/intervention restore their demo form state while clearing local result output
- the browser suite now also verifies selection-driven snapshot cards in review and promotion, so changing the selected candidate or decision must update the visible context before any action is taken
- the browser document path now uploads multiple ZIP archives and verifies extracted-child rendering plus parser-list overflow behavior on `/`
- the browser suite now compares rendered source-document cards, parse-task cards, timeline entries, recent review decisions, and recent promotions against the visible persisted-state slice for each panel
- the browser suite now creates enough accepted reviews and promotions to verify overflow behavior for the capped recent-decisions and recent-promotions feeds
- the browser suite now also saves `reject` and `follow_up` review decisions through the UI and verifies the promotion workbench returns to the empty pending state once all accepted decisions are consumed
- the browser suite now also revisits the review workbench after promotion overflow so non-accept actions are exercised after the accepted queue has been drained
- the browser suite now also updates an existing rejected decision back to `accept`, verifies the same review record is updated in place, confirms the pending promotion queue repopulates, and then promotes it without duplicating review decisions
- the review workbench now hydrates its form from any existing saved decision for the selected candidate, and the browser suite verifies those reopened values before updating the decision again
- the review workbench reset path now restores the current candidate's persisted or default form state without changing selection, and the browser suite verifies unsaved edits are discarded locally
- canonical mappings are now accept-only: non-accept review saves strip any stale mapping input, the review UI clears the mapping when the action changes away from `accept`, and both suites verify that contract
- the promotion workbench now only queues accepted mapped decisions whose parser candidate is numeric, and the browser suite verifies a mapped text-valued FHIR observation stays out of that queue
- promoted review decisions are now immutable: the API suite verifies post-promotion review-save attempts fail with `400` and leave persisted state unchanged, while the browser suite verifies promoted candidates disappear from the editable review queue
- the report workbench now returns stable client-side errors for malformed JSON and non-array entries before issuing a request, and the browser suite verifies both local guards
- the intervention workbench now returns stable client-side errors for blank title/detail and blank or invalid dates before issuing a request, and the browser suite verifies all three local guards
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
- backend parity is only checked when `DATABASE_URL` is configured
- the committed browser suite currently covers the file-backed path only
- the committed browser suite exercises Chromium only, not a cross-browser matrix
