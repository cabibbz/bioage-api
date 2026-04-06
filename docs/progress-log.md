# Progress Log

## Entries

### 2026-04-05

- created a new Next.js codebase for the longevity evidence layer
- added a clinician dashboard shell focused on modality-aware review
- added a normalization catalog and `POST /api/intake/report`
- replaced hardcoded page data with a file-backed local store
- added `GET /api/patients/[patientId]` for inspection
- added a documentation contract, ADRs, compact snapshot, and docs verifier
- added `POST /api/intake/intervention` and a clinician intervention-tagging workbench
- ran an end-to-end probe confirming report ingestion increases stored measurements and timeline events
- ran an end-to-end probe confirming intervention intake increases timeline events
- added an ingestion-format research brief covering files, structured payloads, FHIR, spreadsheets, ZIP packages, and standards implications
- added source-document persistence with checksum, mime, and storage metadata
- added `POST /api/intake/document` and a ZIP archive indexing skeleton
- ran an end-to-end probe confirming ZIP upload increases stored source documents and timeline events
- upgraded ZIP intake to extract supported child documents into first-class source-document records
- ran an end-to-end probe confirming one ZIP upload created one parent archive document plus three extracted child documents
- added a parser-task persistence model and deterministic parser runner
- wired document intake to create parse tasks for parent uploads and extracted child documents
- added deterministic summaries for FHIR JSON, generic JSON, CSV, TXT, C-CDA structure, and ZIP manifests
- added review-only task states for PDF, image, HTML, XLS/XLSX, and unknown documents
- added a parser-contract research brief and an ADR for parser-task architecture
- ran an end-to-end probe confirming one ZIP upload created four parse tasks: archive manifest, FHIR bundle, CSV table, and text note
- added a clinician review-decision persistence model and `/api/review/decision`
- added a review workbench and surfaced review counts in the parser panel
- added research and an ADR for the review-decision layer
- ran an end-to-end probe confirming review decisions persist against parser candidates and append audit events to the timeline
- added measurement-promotion persistence and `/api/review/promote`
- added a promotion workbench for accepted numeric review decisions
- added research and an ADR for explicit promotion audit records
- ran an end-to-end probe confirming accepted CSV candidates can be reviewed and promoted into canonical measurements with audit records
- added a committed `npm run test:integration` smoke harness covering document intake, review, and promotion
- ran the committed integration smoke harness successfully against a local Next server
- added a repository abstraction so the app layer no longer imports the file store directly
- added a concrete Postgres schema target and migration notes for the next backend step
- added a binary-storage abstraction so document ingestion no longer writes directly to local paths
- added a Postgres seed export script for migrating `data/store.json` into SQL inserts
- generated `db/seed-from-store.sql` from the current local seed
- implemented a real `postgres` evidence repository behind the existing repository contract
- aligned the Postgres schema and seed export with source-document `relativePath` metadata
- installed `@types/pg` so the Postgres backend passes strict TypeScript validation
- added `npm run bootstrap:postgres` to apply schema plus seed into a configured Postgres database
- expanded the integration smoke harness to cover report intake, intervention intake, document intake, review, and promotion
- added backend-specific smoke entrypoints for file and Postgres paths
- added `npm run verify:meta` as the session-level verification gate
