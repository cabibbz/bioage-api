# ADR-0003 Envelope-First Ingestion

## Status

Accepted

## Decision

Model ingestion by envelope type before modeling it by vendor.

The first envelope types are:

- source documents
- structured JSON payloads
- FHIR JSON
- spreadsheets
- ZIP archives

Vendor-specific logic should sit on top of these generic ingestion seams.

## Consequences

- the codebase can support more vendors without rebuilding the storage model
- ZIP, PDF, JSON, and FHIR support can evolve independently
- document provenance becomes a first-class concern instead of an afterthought

