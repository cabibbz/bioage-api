# Parsing Pipeline Strategy

Last updated: 2026-04-05

Status note: the first parser-task slice described here has now been implemented in the prototype. This memo remains useful as the rationale for that decision.

## Executive Summary

The next build step should be a parser/review queue, not a direct jump to freeform OCR.

Why:

- healthcare standards already separate documents, binary artifacts, observations, and workflow tasks
- real vendor data mixes structured JSON with PDFs/HTML and partial results
- some formats can be parsed deterministically today
- others should wait for review queues or multimodal parsers

## What The Standards Say

### FHIR DocumentReference and Attachment

FHIR `DocumentReference` exists to track documents with metadata, not just the raw file. Its content uses `Attachment`, which carries mime type and URL/reference semantics. The page explicitly describes the content attachment as carrying the document or URL "along with critical metadata to prove content has integrity."

Practical implication:

- keep document metadata separate from parsed output
- track file location, mime type, and integrity metadata

### FHIR Binary

FHIR `Binary` is for the raw artifact itself. It can represent any content, including PDF, image, JSON, and ZIP.

Practical implication:

- raw binary and document metadata are distinct concepts
- our current `sourceDocuments` model is directionally aligned with this split

### FHIR DiagnosticReport and Observation

FHIR `DiagnosticReport` can include both atomic `Observation` results and the `presentedForm` attachment representing the report "as issued", typically a PDF. `Observation` supports multiple value types, interpretation, reference ranges, and components.

Practical implication:

- we should not force everything into a flat scalar metric table
- parser output must support structured clinical results plus a human-facing rendered form

### FHIR Provenance

FHIR `Provenance` explicitly frames trust, authenticity, and reproducibility as first-class concerns. It models targets, entities used, and agents involved.

Practical implication:

- every parse task should preserve source-document references and transformation context

### FHIR Task

FHIR `Task` exists specifically to represent activities to be performed and track workflow state. The spec explicitly describes queue semantics that can be polled or subscribed to.

Practical implication:

- a parser/review queue is not an invention; it is a normal workflow concept
- internal parse jobs should behave like tasks even if we do not serialize them as FHIR yet

## What Vendor Reality Says

### Junction

Junction returns both raw `PDF` results and structured `JSON` results. It also makes partial results available before final results, and notes that LOINC is helpful but not guaranteed.

Practical implication:

- parse state must tolerate partial/final lifecycle
- LOINC should be optional
- raw PDFs and parsed JSON should coexist

### Hurdle

Hurdle returns structured biomarker results, interpretation rules, specimen details, and report URLs. The result field can be:

- numeric
- categorical
- bounded string like `<7.00`
- error text like `Quantity Not Sufficient`

Practical implication:

- parser output must support typed numeric results plus bounded and error strings

### Cerbo

Cerbo imported lab results arrive as PDF or HTML, and when structured data exists it is stored separately. Cerbo also has an explicit review workflow and matching-to-order flow.

Practical implication:

- review queues are part of real clinic workflow, not an optional later feature
- document + discrete values is the right model

### Practice Better

Practice Better migration is still heavily file-oriented: Excel/CSV plus client documents in folders. The API exists, but access is gated through beta enrollment and approval.

Practical implication:

- file ingestion continues to matter even when an API exists
- the product cannot assume direct API access for every deployment

## What This Means For Parsing

### Deterministic First

High-confidence deterministic parsing should come first for:

- `fhir_bundle`
- `fhir_resource`
- `json_payload`
- `spreadsheet` when CSV-like
- `text_note`
- `ccda_xml` at a metadata and structural level

These can produce safe summaries and extract useful structure without guessing from pixels.

### Queue Before OCR

PDF, image, and some HTML documents should enter a parser/review queue rather than being treated as immediately parsed.

Reasons:

- clinical trust demands provenance
- OCR and multimodal parsing are more failure-prone
- review state matters operationally

### Later Multimodal Parsing

OpenAI's current official docs indicate that PDF files can be sent directly as file inputs, and the model receives both extracted text and page images in context. Structured Outputs can constrain JSON to a schema.

Inference:

- a later parser worker can use multimodal model parsing for PDFs without us first rasterizing them ourselves
- when we reach that stage, schema-constrained extraction is the right path

## Recommended Next Implementation

1. Add `parseTasks` to the local store.
2. Automatically create parse tasks for source documents and extracted child documents.
3. Run deterministic parsers immediately for:
- FHIR JSON
- generic JSON
- CSV
- TXT
- basic C-CDA structural detection
4. Leave PDF and image tasks in a review-ready state.
5. Keep parsed summaries separate from canonical measurement promotion.

## Sources

- FHIR Task: https://www.hl7.org/fhir/R4/task.html
- FHIR Provenance: https://hl7.org/fhir/R4/provenance.html
- FHIR DocumentReference: https://hl7.org/fhir/R4/documentreference.html
- FHIR Binary: https://www.hl7.org/fhir/r4/binary.html
- FHIR DiagnosticReport: https://hl7.org/fhir/R4/diagnosticreport.html
- FHIR Observation: https://hl7.org/fhir/r4/observation.html
- FHIR Attachment datatype: https://hl7.org/fhir/R4/datatypes.html
- Junction result formats: https://docs.junction.com/lab/results/result-formats
- Hurdle retrieving results: https://docs.hurdle.bio/docs/retrieving-results
- Cerbo imported lab results: https://help.cer.bo/support/solutions/articles/8000009803-imported-lab-results
- Cerbo exporting patient data: https://help.cer.bo/support/solutions/articles/8000108600-exporting-patient-data-from-cerbo
- Practice Better migration FAQ: https://help.practicebetter.io/hc/en-us/articles/33463877188379
- Practice Better API beta: https://help.practicebetter.io/hc/en-us/articles/16637584053275-Getting-Started-with-the-Practice-Better-API-Beta
- OpenAI file inputs for PDFs: https://platform.openai.com/docs/guides/pdf-files
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
