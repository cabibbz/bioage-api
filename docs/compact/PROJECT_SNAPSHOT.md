# Project Snapshot

## Mission

Build a clinic-facing preventive evidence layer. Biological age is the wedge, not the whole product. The system should ingest source reports and wearable data, preserve provenance, summarize what it safely understands, and support longitudinal clinical review.

## Current Build State

The app is a working Next.js prototype with a seeded patient, dashboard shell, report-normalization API, intervention-tagging API, source-document upload API, repository-based persistence boundary, binary-storage abstraction, file-backed default backend, implemented Postgres backend, archive extraction, parser-task workflow, clinician review-decision layer, and measurement-promotion layer. Uploading a document stores the source artifact, classifies it, creates parent and child source-document records, and generates parser tasks. Deterministic parsers summarize FHIR bundles/resources, generic JSON, CSV, TXT, C-CDA structure, and ZIP manifests. PDF, image, HTML, XLS/XLSX, and unknown formats remain review-first. Clinicians can record accept, reject, or follow-up decisions against parser candidates, propose canonical mappings, and promote accepted numeric decisions into canonical measurements with explicit audit records. The repo now has a session-level `npm run verify:meta` gate, backend-specific functional tests, a browser-driven UI suite for all five clinician workbenches plus a UI inventory guard that fails if `/` gains a new interactive workbench without an exercised path, browser workbench-breadth rules that require both a success path and an invalid-action path for every discovered workbench, dashboard read-panel coverage for the signal board/source-documents/parse-task/timeline/clinician-prep surfaces, persisted-state snapshot checks that compare both `GET /api/patients/[patientId]` and the visible dashboard against the backend record after each workflow step, browser archive-upload coverage that verifies extracted-child rendering and parser-list overflow behavior across multiple archive uploads, overflow coverage for the capped recent-decisions and recent-promotions feeds, list-level UI assertions for source documents, parse tasks, timeline entries, recent review decisions, and recent promotions, mutation response-contract checks that compare `patientSnapshot` summaries against persisted state, an API route-breadth guard that requires both success and error coverage for every discovered route method, trim-aware required-field validation across the mutation routes, a shared parser contract that drives runtime parser selection, a coverage guard that fails if a declared parser or classification lacks a fixture, explicit missing-resource and invalid-state functional coverage, invariant checks for storage and cross-record integrity, a verify path that checks Postgres seed drift without dirtying tracked files and fails if the worktree changes relative to its starting state, and a parity runner that compares normalized file-vs-Postgres outcomes for the same scenarios when a database is available. It also has a concrete Postgres schema target at `db/postgres-schema.sql`, a repo-driven `npm run bootstrap:postgres` path, and a generated SQL seed at `db/seed-from-store.sql`.

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
