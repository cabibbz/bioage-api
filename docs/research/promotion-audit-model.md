# Promotion Audit Model

Last updated: 2026-04-05

## Executive Summary

Once a clinician accepts a parser candidate, the next safe move is not a silent overwrite. It is an explicit promotion record that links the reviewed candidate to the canonical measurement written into the patient record.

## Standards Signals

### FHIR Observation

FHIR `Observation` supports `derivedFrom` references for related measurements the observation is made from. The guidance explicitly describes using `derivedFrom` when one observation is calculated or produced from supporting results.

Practical implication:

- promoted measurements should keep a clear chain back to reviewed source-derived candidates

### FHIR Provenance

FHIR `Provenance` treats targets and entities used in creation as first-class concepts.

Practical implication:

- promotion should record what was promoted, from which decision, from which source document, and when

### FHIR DiagnosticReport And DocumentReference

FHIR continues to distinguish issued reports/documents from discrete observations.

Practical implication:

- promotion is a transformation step, not proof that the original document stopped mattering

## Product Implication

The product should keep:

1. source document
2. parse task
3. review decision
4. promotion record
5. canonical measurement

My strongest opinion: promotion should stay explicit and auditable first, then widen from numeric candidates to reviewed text and bounded values without collapsing provenance.

## Sources

- FHIR Observation: https://www.hl7.org/fhir/r4/observation.html
- FHIR Provenance: https://hl7.org/fhir/R4/provenance.html
- FHIR DiagnosticReport: https://hl7.org/fhir/R4/diagnosticreport.html
- FHIR DocumentReference: https://hl7.org/fhir/R4/documentreference.html
