# Object Storage Plan

Last updated: 2026-04-05

## Executive Summary

The runtime now has a binary-storage abstraction, but the active backend is still the local filesystem.

The intended long-term shape is:

- object storage for uploaded and extracted binaries
- Postgres for metadata and audit records
- repository contracts separating both from the app layer

## Why This Needs Its Own Layer

Source binaries have different requirements than relational state:

- larger payloads
- lifecycle and retention concerns
- possible encryption and signed URL needs
- no reason to force them into the same implementation as patient metadata

This is why the runtime should not let document ingestion write directly to `data/uploads` forever.

## Current Runtime Shape

The code now resolves binary writes through a storage adapter:

- local filesystem backend is active by default
- object-storage backend exists only as a stub

The source-document metadata keeps:

- `storageBackend`
- `storageKey`
- `relativePath`
- checksum and mime metadata

That means the metadata model is already aligned with a later object-storage move.

## Migration Rule

Do not change the source-document contract when moving to object storage.

The move should preserve:

- source-document ids
- storage metadata
- checksum integrity
- child archive extraction behavior
- parser, review, and promotion references

If object storage changes any of those semantics, the migration is wrong.

## What I'd Do Next

1. Implement a real object-storage repository behind the current adapter.
2. Store `storageKey` as the durable locator and treat `relativePath` as a local-dev convenience.
3. Add a migration utility that uploads existing `data/uploads` files and rewrites source-document metadata safely.
