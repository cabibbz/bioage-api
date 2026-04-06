# Review Decision Workflow

Last updated: 2026-04-05

## Executive Summary

The safest next layer after parser tasks is a clinician review-decision object.

Why:

- parser output is not clinical truth
- standards distinguish workflow, provenance, and validation from final result storage
- the product needs an auditable place to record acceptance, rejection, or follow-up decisions before any canonical promotion

## Standards Signals

### FHIR Task

FHIR `Task` is the official workflow resource for activities, state transitions, focus, and output. That makes it the right mental model for parser jobs and later review queues.

Practical implication:

- parse and review should be modeled as explicit work, not hidden side effects

### FHIR Provenance

FHIR `Provenance` captures who, what, when, and the entities/agents involved in producing or changing data.

Practical implication:

- review decisions need reviewer identity, timestamps, and references back to the candidate and source document

### FHIR VerificationResult

FHIR `VerificationResult` exists for validation status tracking and includes statuses such as `attested`, `validated`, `in-process`, `val-fail`, and `reval-fail`.

Practical implication:

- the broader FHIR ecosystem expects validation state to be explicit
- a lightweight local review-decision record is appropriate now, even if we do not serialize full `VerificationResult` resources yet

### US Core And Document Reality

US Core clinical notes and lab guidance still require support for both document-oriented exchange and discrete result exchange. Some systems keep scanned or attached documents where others expose structured observations.

Practical implication:

- a clinician may need to accept a parser candidate as plausible without immediately treating it as a final canonical measurement

## Product Implication

The right v1 sequence is:

1. source document
2. parse task
3. candidate value
4. clinician review decision
5. canonical measurement promotion

This keeps the system honest. It prevents a fragile parser from silently mutating the longitudinal patient record.

## What I’d Do

The review object should capture:

- parse task reference
- source document reference
- candidate reference
- action: accept, reject, follow-up
- reviewer name
- note
- optional proposed canonical mapping
- created and updated timestamps

My strongest opinion: acceptance should still not directly mutate the patient measurement table until the promotion rules and audit UX are stable.

## Sources

- FHIR Task: https://hl7.org/fhir/R4/task.html
- FHIR Provenance: https://hl7.org/fhir/R4/provenance.html
- FHIR VerificationResult: https://hl7.org/fhir/R4/verificationresult.html
- US Core clinical notes: https://www.hl7.org/fhir/us/core/clinical-notes.html
- US Core lab Observation: https://hl7.org/fhir/us/core/STU8.0.1/StructureDefinition-us-core-observation-lab.html
