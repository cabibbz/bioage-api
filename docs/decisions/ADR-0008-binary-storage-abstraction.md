# ADR-0008 Binary Storage Abstraction

## Status

Accepted on 2026-04-05.

## Decision

Move source-binary writes behind an explicit storage adapter instead of writing directly to `data/uploads` from document ingestion code.

Current rule set:

- local filesystem storage remains the default backend
- object storage is the long-term target and current stub
- source-document metadata must record storage backend plus storage key
- parser, review, and promotion logic should not care where the binary is stored

## Consequences

Benefits:

- object-storage migration now has a stable seam
- document-ingestion logic no longer owns storage-path mechanics directly
- runtime metadata aligns better with the Postgres schema target

Costs:

- one more abstraction must stay in sync with docs and persistence
- object storage is still not implemented
- local metadata still carries `relativePath` for developer convenience
