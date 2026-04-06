# ADR-0006 Measurement Promotion Record

## Status

Accepted on 2026-04-05.

## Decision

When an accepted review decision is promoted into the canonical measurement record, store an explicit promotion record rather than silently writing only the measurement.

Current rule set:

- only accepted review decisions can be promoted
- the decision must include a proposed canonical mapping
- promoted candidates may carry numeric or reviewed text/bounded values
- promotion writes a canonical measurement and a promotion audit record
- promotion remains traceable to review decision, parse task, and source document

## Consequences

Benefits:

- canonical writes stay auditable
- later rollback, replay, and promotion analytics become possible
- the patient record reflects reviewed evidence instead of raw parser output

Costs:

- the persistence model grows again
- direct report intake still does not accept non-numeric entries
- bulk promotion and conflict handling still need future design
