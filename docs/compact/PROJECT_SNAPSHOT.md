# Project Snapshot

## Mission

Build a clinic-facing preventive evidence layer. Biological age is the wedge, not the whole product. The system should ingest source reports and wearable data, preserve provenance, summarize what it safely understands, and support longitudinal clinical review.

## Current Build State

The app is a working Next.js prototype with a seeded patient, dashboard shell, report/intervention/document APIs, repository-based persistence, a file-backed default backend, an implemented Postgres backend, archive extraction, parser tasks, clinician review decisions, and measurement promotion. Uploading a document stores the artifact, classifies it, creates parent/child source-document records, and generates parser tasks. Deterministic parsers cover FHIR bundles/resources, generic JSON, CSV, TXT, C-CDA, and ZIP manifests; PDF, image, HTML, XLS/XLSX, and unknown formats stay review-first. Clinicians can record accept/reject/follow-up decisions, propose canonical mappings, and promote accepted numeric decisions into canonical measurements with explicit audit records; reopening a reviewed candidate reloads its saved form state, review reset restores the current candidate's persisted/default form state, document reset clears the actual file input and default source-system, canonical mappings are accept-only, only numeric accepted decisions appear in the promotion queue, promoted decisions become immutable and disappear from the editable review queue, and blank document source-system, blank review reviewer, malformed report JSON, non-array report entries, plus blank/invalid intervention dates and blank intervention title/detail now fail with stable client-side errors before any request is sent. The repo now has a session-level `npm run verify:meta` gate, backend-specific functional tests, a browser suite for all five clinician workbenches with inventory guards, workbench breadth rules requiring both success and invalid-action paths, dashboard read-panel coverage for the signal board/source documents/parse tasks/timeline/clinician-prep surfaces, persisted-state snapshot checks that compare both `GET /api/patients/[patientId]` and the visible dashboard against backend state after each workflow step, archive-upload coverage for extracted-child rendering and parser-list overflow across multiple ZIP uploads, overflow coverage for capped recent-decisions and recent-promotions feeds, UI coverage for non-accept review actions plus the emptied promotion queue, the recovery path where a rejected decision is reopened to accepted and then promoted without duplicating review records, list-level UI assertions for source documents/parse tasks/timeline/recent reviews/recent promotions, mutation response-contract checks for `patientSnapshot`, an API route-breadth guard requiring both success and error coverage for every discovered route method, trim-aware required-field validation, a shared parser contract with fixture coverage guards, explicit missing-resource and invalid-state functional coverage, storage and cross-record invariant checks, a verify path that checks Postgres seed drift without dirtying tracked files and fails if the worktree changes, and a parity runner that compares normalized file-vs-Postgres outcomes when a database is available. It also has a concrete Postgres schema target at `db/postgres-schema.sql`, a repo-driven `npm run bootstrap:postgres` path, and a generated SQL seed at `db/seed-from-store.sql`.

## Critical Files

- `src/lib/persistence/index.ts`: repository selection boundary
- `src/lib/parsing/parser-contract.json`: shared parser/classification contract
- `src/lib/persistence/postgres-repository.ts`: Postgres persistence implementation
- `src/lib/storage/index.ts`: binary-storage selection boundary
- `src/lib/persistence/store.ts`: local persistence and audit writes
- `src/lib/parsing/task-runner.ts`: deterministic parsers and review-task generation
- `app/api/review/promote/route.ts`: accepted-decision promotion
- `scripts/functional-tests.mjs`: committed route- and parser-matrix functional suite
- `scripts/ui-functional.mjs`: committed browser-driven clinician workflow suite
- `scripts/functional-parity.mjs`: file-vs-Postgres parity verification
- `scripts/meta-verify.mjs`: session-level verification gate
- `scripts/bootstrap-postgres.mjs`: additive schema-plus-seed Postgres bootstrap
- `scripts/export-postgres-seed.mjs`: JSON-to-SQL migration helper
- `db/postgres-schema.sql`: next-step database target
- `db/seed-from-store.sql`: generated SQL seed from the current local store

## Open Risks

- local file storage is not safe for multi-user or concurrent writes
- object storage is still a stub behind the storage adapter
- the Postgres backend is only functionally tested when `DATABASE_URL` is available
- only numeric accepted decisions are promotable in v1
- PDF, image, HTML, and binary spreadsheet parsing are intentionally deferred

## Next 3 Moves

1. Run the Postgres functional path against a live database once `DATABASE_URL` is available in the environment.
2. Implement the real object-storage backend behind the current storage contract.
3. Add promotion support for accepted text and categorical decisions plus better conflict handling.
