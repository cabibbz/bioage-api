# ADR-0007 Repository Abstraction

## Status

Accepted on 2026-04-05.

## Decision

Move the app layer onto an explicit repository contract instead of importing the file store directly.

Current rule set:

- routes and page loaders should resolve persistence through `getEvidenceRepository()`
- the default backend remains the local file repository
- a Postgres backend can be selected later through the same contract
- the contract must cover the full workflow: ingestion, parsing, review, promotion, and projections

## Consequences

Benefits:

- the app layer no longer depends directly on the local store implementation
- Postgres migration work can happen behind a stable interface
- object-storage and database migration can proceed incrementally

Costs:

- there is now one more abstraction layer to maintain
- the Postgres backend is still a stub and not production-ready
- repository drift must be controlled with docs and functional tests
