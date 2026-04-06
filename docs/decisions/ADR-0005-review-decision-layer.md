# ADR-0005 Review Decision Layer

## Status

Accepted on 2026-04-05.

## Decision

Introduce an explicit review-decision object between parser candidates and canonical measurement promotion.

Current rule set:

- only parser candidates can be reviewed
- a decision records accept, reject, or follow-up
- a decision keeps reviewer identity, timestamps, candidate snapshot, and optional proposed canonical mapping
- accepted decisions still do not write into the patient measurement table
- review decisions should update the patient timeline for auditability

## Consequences

Benefits:

- parser output stays separate from clinical truth
- clinicians can start adjudicating candidates now
- later promotion logic has an auditable upstream record

Costs:

- the system now has another persistence object and UI surface
- accepted candidates still require a later promotion flow
- review changes are append/update operations that need future conflict handling in multi-user scenarios
