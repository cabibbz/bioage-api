# ADR-0002 Local File Store

## Status

Accepted

## Decision

Use a local JSON file store for the earliest build slice.

Reasons:

- zero infrastructure friction
- enough to prove ingestion, normalization, and timeline updates
- easy to inspect during rapid iteration

## Consequences

- no concurrency guarantees
- poor fit for multiple users
- migration to a real database is expected soon
- storage design should stay simple so migration is straightforward

