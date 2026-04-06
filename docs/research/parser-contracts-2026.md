# Parser Contracts And Standards Reality

Last updated: 2026-04-05

## Executive Summary

As of April 5, 2026, the most certain parsing path is:

- preserve every source artifact first
- represent parsing as explicit tasks
- deterministically summarize structured formats now
- keep PDFs, images, HTML exports, and binary spreadsheets in review-first status

This is not just a product preference. It is the direction implied by current HL7, US Core, and vendor reality.

## Standards Reality

### C-CDA Is Still Current

HL7 C-CDA `4.0.0` is the current published version, active as of `2025-06-20`. It explicitly covers multiple document types including `Continuity of Care Document (CCD)`, `Progress Note`, and `Unstructured Document`, and it defines both section templates and entry templates.

Practical implication:

- C-CDA is still a real ingestion target, not dead legacy
- v1 should support structural C-CDA summarization even before deep discrete extraction

### FHIR Separates Documents, Binaries, Reports, And Workflow

FHIR makes several distinctions that map directly to the product:

- `Binary` is the raw artifact and can contain PDF, image, JSON, or ZIP content
- `DocumentReference` is metadata about a document and points to an attachment
- `DiagnosticReport` groups results and may also carry `presentedForm`, the report "as issued"
- `Observation` represents individual results and supports missing-data semantics
- `Task` tracks activities and queue state

Practical implication:

- raw files and parsed summaries should not be the same record
- parse/review state should be modeled explicitly as tasks
- results can stay as candidate observations before they become canonical measurements

### US Core Requires Both Document And Result Paths

US Core clinical-notes guidance says systems must implement `DocumentReference`, and explicitly notes that some systems scan lab reports and do not store them as `DiagnosticReport`.

US Core laboratory guidance keeps lab reporting split across:

- `DiagnosticReport` for grouped laboratory reports
- `Observation` for individual laboratory results

US Core laboratory Observation guidance also requires:

- laboratory category
- LOINC if available
- a value or a data-absent reason unless the result is represented through members/components
- UCUM units for numeric quantities

Practical implication:

- the platform must support both scanned-document reality and structured-result reality
- LOINC should be optional but first-class
- bounded strings and absent-data reasons are normal, not corner cases

### HL7 v2 Result Traffic Still Matters

HL7 v2 `ORU^R01` remains a canonical result message shape for unsolicited observations. The structure is still fundamentally:

- patient (`PID`)
- order/report (`OBR`)
- observations (`OBX`)
- optional specimen context (`SPM`)

Practical implication:

- when direct result feeds appear later, the parser model should already expect report-level plus observation-level hierarchy
- we do not need live HL7 v2 ingestion in v1, but we should not design a flat-only schema

## Vendor Reality

### Terra

Terra's current lab-report parser accepts `PDF`, `PNG`, and `JPEG`, processes asynchronously, and supports webhook-driven delivery and external reference IDs.

Practical implication:

- image/PDF parsing can be outsourced later
- our internal model should still preserve the original file and downstream parse state

### Junction

Junction exposes both raw result `PDF`s and structured `JSON`. It also documents `partial` versus `final` result states and notes that results can arrive before finalization.

Practical implication:

- source files and structured payloads need to coexist
- parse status must tolerate partial/final lifecycles

### Hurdle

Hurdle documents that result values may be:

- numeric
- categorical
- bounded strings like `<7.00` or `>=24`
- error text like `Quantity Not Sufficient`

Practical implication:

- candidate extraction cannot assume every result is a simple float
- review logic must preserve raw result text

## What This Means For The Product

### The Right Contract

The most robust internal contract is:

1. `sourceDocument`
2. `parseTask`
3. parse summary + candidate observations
4. clinician review decision
5. canonical measurement promotion

That keeps provenance, parsing, and interpretation separate.

### The Right Parser Priority

Build now:

- FHIR bundles and single FHIR resources
- generic JSON candidate extraction
- CSV tabular extraction
- TXT note summarization
- C-CDA structural summarization
- ZIP manifest + extracted-child task creation

Review-first for now:

- PDF
- images
- HTML exports
- XLS / XLSX
- raw HL7 v2 feeds

### My Strongest Opinion

Inference from the standards and vendor docs:

- the winning product is not "a parser"
- it is a provenance-safe clinical evidence layer with parser tasks inside it

If we blur source files, parser output, and canonical truth into one object, the product will become untrustworthy fast.

## Product Direction

The concrete path I would keep following:

- maintain explicit parse tasks in persistence
- surface parser status in the UI
- never auto-promote candidate values into patient measurements
- add field-level review decisions next
- only then add vendor-specific parsers or multimodal PDF extraction

The highest-confidence next technical move after this parser-task slice is a review-decision layer, not OCR.

## Sources

- C-CDA 4.0.0 home: https://hl7.org/cda/us/ccda/
- C-CDA provenance guidance: https://hl7.org/cda/us/ccda/4.0.0/provenance.html
- FHIR Task: https://www.hl7.org/fhir/R4/task.html
- FHIR Binary: https://www.hl7.org/fhir/R4/binary.html
- FHIR DocumentReference: https://www.hl7.org/fhir/R4/documentreference.html
- FHIR Documents: https://www.hl7.org/fhir/documents.html
- FHIR DiagnosticReport: https://hl7.org/fhir/R4/diagnosticreport.html
- FHIR Observation: https://hl7.org/fhir/R4/observation.html
- US Core clinical notes: https://www.hl7.org/fhir/us/core/clinical-notes.html
- US Core lab DiagnosticReport: https://hl7.org/fhir/us/core/2025Jan/StructureDefinition-us-core-diagnosticreport-lab.html
- US Core lab Observation: https://hl7.org/fhir/us/core/2025Jan/StructureDefinition-us-core-observation-lab.html
- HL7 v2 ORU R01: https://www.hl7.eu/refactored/msgORU_R01.html
- Terra lab reports: https://docs.tryterra.co/lab-reports/lab-report-api-documentation
- Terra data destinations: https://docs.tryterra.co/health-and-fitness-api/integration-setup/understanding-sources-and-destinations
- Junction result formats: https://docs.junction.com/lab/results/result-formats
- Junction result PDF endpoint: https://docs.junction.com/api-reference/lab-testing/results/get-results-pdf
- Hurdle retrieving results: https://docs.hurdle.bio/docs/retrieving-results
