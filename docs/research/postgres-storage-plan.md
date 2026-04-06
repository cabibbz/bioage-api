# Postgres Storage Plan

Last updated: 2026-04-05

## Executive Summary

The codebase now has a real Postgres repository implementation, but the verified default backend is still the local file store.

The next persistence step is no longer repository scaffolding. It is:

- live Postgres verification
- migration/bootstrap safety
- object storage for source binaries

## Why This Shape

### The Product Is Audit-Heavy

This product is not just CRUD over patients. It has explicit workflow stages:

1. source document
2. parse task
3. review decision
4. measurement promotion
5. canonical measurement

That means a relational model is a better default than treating everything as one mutable JSON document.

### Source Files Should Not Live In Postgres

The current file store proves the ingestion flow, but long-term source binaries should move to object storage. Postgres should keep metadata, checksums, and storage keys, not large PDF, ZIP, or image blobs.

### JSONB Still Helps

Some parts of the workflow are best treated as semi-structured payloads in v1:

- parser metadata
- parser candidates
- report-ingestion mapped and unmapped payloads
- archive manifests

That is why the proposed schema keeps the core relationships relational while allowing `jsonb` for parser-specific detail.

## Proposed Database Boundary

Use Postgres for:

- patients
- canonical measurements
- timeline events
- report ingestions
- source document metadata
- parse tasks
- review decisions
- measurement promotions

Use object storage for:

- uploaded PDFs
- images
- ZIPs
- extracted child binaries

The table should store `storage_key`, `relative_path` for local recovery, checksum, and mime metadata.

## Migration Rule

The migration should preserve the current product contract exactly:

- do not remove source-document visibility
- do not collapse parser candidates into canonical measurements
- do not remove explicit review or promotion audit records

If the Postgres migration weakens provenance, it is the wrong migration.

## Current Repo Support

The app layer resolves a repository through `getEvidenceRepository()`, and the Postgres runtime now lives behind:

- `src/lib/persistence/postgres-repository.ts`
- `src/lib/persistence/postgres-client.ts`
- `db/postgres-schema.sql`
- `scripts/bootstrap-postgres.mjs`
- `scripts/export-postgres-seed.mjs`

The file store remains the default and the committed smoke harness still validates that path first.

## What I'd Do Next

1. Run the committed workflow against a disposable local Postgres database and add a Postgres smoke harness.
2. Move source binary writes to a real object-storage backend while keeping `storageKey` and checksum semantics stable.
3. Add a bootstrap utility that applies schema plus seed safely from `data/store.json` for environment setup.
