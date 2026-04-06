# Architecture

## System Boundaries

Current system shape:

- Next.js app router frontend and API routes
- the dashboard route is intentionally dynamic so clinician refreshes reflect newly persisted state
- repository abstraction with a file-backed default backend and implemented Postgres backend
- binary-storage abstraction with a local filesystem default backend
- normalization layer that maps vendor/source fields into canonical concepts
- source-document storage with checksum and mime metadata
- ZIP archive indexing with supported child-document extraction
- parser-task queue with deterministic summaries and review-only states
- clinician review-decision layer for parser candidates
- measurement-promotion layer for accepted reviewed decisions
- clinician dashboard surface for timeline review
- intervention intake route for protocol/event tagging

Current non-goals:

- no authentication yet
- no object storage yet
- no always-on live-Postgres verification environment yet
- no EHR integration yet
- no lab/wearable live connectors yet
- no field-level review decisions yet
 

## Current Data Flow

1. User opens `/`.
2. Server component resolves the active repository, which defaults to file storage and can switch to Postgres through environment configuration, then loads patient `pt_001`.
3. User submits source metrics in the upload workbench.
4. `POST /api/intake/report` normalizes source aliases plus a small safe alternate-unit set into canonical measurements.
5. The route persists a report-ingestion record and prepends new measurements and a timeline event to the patient record, including first-class bounded, text, and genetic categorical findings.
6. `POST /api/intake/document` stores a source file, fingerprints it, classifies it, and extracts supported ZIP children into child source-document records.
7. The document path creates parser tasks for the parent document and any extracted children.
8. Deterministic parsers summarize FHIR JSON, generic JSON, CSV, TXT, C-CDA structure, and ZIP manifests immediately.
9. PDF, image, HTML, binary spreadsheet, and unknown formats are marked for review instead of being force-parsed.
10. `POST /api/review/decision` stores clinician decisions against parser candidates and appends audit notes to the patient timeline.
11. `POST /api/review/promote` promotes accepted reviewed decisions with numeric or text values into canonical measurements using the same unit-conversion and text-canonicalization rules as direct report intake, then stores promotion audit records.
12. `POST /api/intake/intervention` persists protocol changes directly into the timeline.
13. The client refreshes and the page reflects the newly stored data.

## Near-Term Architecture Gaps

- keep the live-Postgres functional path exercised against a disposable database
- move source report binaries into object storage with checksums
- add field-level review queues for unmapped metrics
- separate source ingestion from clinician-facing projections
- expand vendor-specific categorical value normalization beyond the current ApoE SNP, MTHFR, and first qualitative, bounded, detection-limit, assay-qualified, positive-or-negative-for-process, prefix-style process, result-labeled, parenthetical process, colon-labeled process, and comma-labeled process lab wording rules
- broaden unit-aware normalization beyond the current small safe alternate-unit set
- support vendor-specific and multimodal PDF parsing only after review semantics exist
