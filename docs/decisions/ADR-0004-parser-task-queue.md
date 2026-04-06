# ADR-0004 Parser Task Queue

## Status

Accepted on 2026-04-05.

## Decision

Represent document parsing as explicit parse tasks that stay separate from both source-document records and canonical patient measurements.

Current rule set:

- create a parse task for every uploaded source document
- create parse tasks for archive-extracted child documents too
- run deterministic parsing immediately for:
  - FHIR bundles
  - single FHIR resources
  - generic JSON
  - CSV
  - TXT
  - C-CDA structural metadata
  - ZIP manifests
- mark PDF, image, HTML, XLS/XLSX, and unknown formats as review-first tasks
- do not auto-promote parser candidates into canonical measurements

## Consequences

Benefits:

- provenance remains intact
- review state becomes explicit
- structured formats become useful immediately
- future multimodal or vendor-specific parsers can plug into the same task model

Costs:

- there is now another persistence object to maintain
- parser candidates still need a later review-decision layer
- the current UI shows summaries, but not full field-level adjudication yet
