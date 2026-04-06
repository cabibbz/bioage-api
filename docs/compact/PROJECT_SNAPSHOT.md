# Project Snapshot

## Mission

Build a clinic-facing preventive evidence layer. Biological age is the wedge, not the whole product. The system should ingest source reports and wearable data, preserve provenance, summarize what it safely understands, and support longitudinal clinical review.

## Current Build State

The app is a Next.js prototype with a seeded patient, dashboard shell, report/intervention/document APIs, repository-based persistence, a file-backed default backend, an implemented Postgres backend, archive extraction, parser tasks, clinician review decisions, measurement promotion, and a validated Tier 1 canonical catalog carrying category, LOINC, unit, range, and normalization-note metadata. Document uploads store artifacts, create parent/child source-document records, and generate parser tasks. Report normalization resolves aliases through that shared catalog, converts a small safe alternate-unit set such as HbA1c IFCC mmol/mol, glucose mmol/L, cholesterol mmol/L, and vitamin D nmol/L into preferred units, preserves non-convertible alternates such as Lp(a) mg/dL with flagged notes, keeps bounded/text report results explicit in clinician-facing interpretation, carries first genetic categorical findings such as ApoE directly into the canonical record, and now canonicalizes vendor ApoE genotype notation including rs429358/rs7412 SNP phrasing, MTHFR copy-count and dual-negative wording, and the first non-genetic qualitative, bounded, detection-limit, assay-qualified, and positive-or-negative-for-process lab phrases while preserving the reported text in ingestion notes. Deterministic parsers cover FHIR bundles/resources, generic JSON, CSV, TXT, C-CDA, and ZIP manifests; PDF, image, HTML, XLS/XLSX, and unknown formats stay review-first. Clinicians can record accept/reject/follow-up decisions, propose canonical mappings, and promote accepted reviewed numeric or text values with audit records, with reviewed promotions now reusing the same unit-conversion and text-canonicalization rules as direct report intake; workbench reopen/reset paths restore persisted or demo state, stale result payloads clear on selection or input changes, invalid actions and backend errors preserve drafts, and post-promotion transitions retarget review/promotion when the current selection disappears. Canonical mappings are accept-only, accepted mapped decisions with promotable values enter the promotion queue, promoted decisions become immutable and leave the editable review queue, and client-side guards block blank/invalid document, review, report, and intervention submissions before any request is sent. The repo has `npm run verify:meta`, browser workflows across file and Postgres backends, parity and API checks, inventory guards, snapshot checks against persisted backend state after each workflow step, archive and decision/promotion overflow coverage, route-breadth plus parser/catalog contract guards, missing-resource and invalid-state coverage, storage and cross-record invariant checks, a verify path that checks Postgres seed drift without dirtying tracked files and fails if the worktree changes, a file functional entrypoint pinned to the file backend even in Postgres-configured shells, and parity runners when a database is available. It also has Postgres schema `db/postgres-schema.sql`, bootstrap path `npm run bootstrap:postgres`, and seed `db/seed-from-store.sql`.

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
- direct report intake now accepts numeric, bounded/text, and first genetic categorical entries with current ApoE SNP, MTHFR, and first qualitative, bounded, detection-limit, assay-qualified, plus positive-or-negative-for-process lab-wording normalization, but broader vendor-specific categorical semantics still need hardening
- unit-aware normalization still only covers a small safe alternate-unit set
- PDF, image, HTML, and binary spreadsheet parsing are intentionally deferred

## Next 3 Moves

1. Expand vendor-specific categorical value normalization beyond the current ApoE SNP, MTHFR, and first qualitative, bounded, detection-limit, assay-qualified, plus positive-or-negative-for-process lab wording rules without hiding provenance.
2. Broaden unit-aware normalization beyond the current small safe alternate-unit set without hiding non-convertible cases like Lp(a).
3. Implement the real object-storage backend behind the current storage contract.
