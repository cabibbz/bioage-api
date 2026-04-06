# Ingestion Format Landscape

Last updated: 2026-04-05

## Executive Summary

The product should not think about ingestion as "parse some PDFs."

It needs to support five ingestion envelopes:

1. document files
2. structured webhook/API payloads
3. FHIR resources and bundles
4. spreadsheet imports
5. ZIP export packages

The immediate conclusion is:

- Tier 1 should be `PDF`, `PNG`, `JPEG`, `JSON`, `FHIR JSON`, `CSV`, and `ZIP`.
- Tier 2 should be `C-CDA XML`.
- Tier 3 should be direct `HL7 v2` feeds.

That order matches current clinic reality better than starting with HL7 interfaces.

## What We Need To Ingest

### 1. Document Files

These are the most common near-term format for longevity and preventive workflows.

Current evidence:

- Terra Lab Reports accepts `PDF`, `PNG`, and `JPEG` and returns structured biomarker JSON.
- Junction returns raw result `PDF`s from labs.
- Cerbo exports uploaded documents in the same format they were originally uploaded in, including PDFs and image files.
- FHIR `DocumentReference` is explicitly designed to reference any recognized mime type, including scanned paper, PDF, image files, CDA, and non-standard office documents.

Implication:

- The platform must ingest source documents as files, not just parsed fields.
- We should preserve original binaries and metadata from day one.

### 2. Structured JSON Payloads

These will be the cleanest long-term ingestion path for connectors and diagnostics partners.

Current evidence:

- Terra pushes normalized payloads to webhooks, SQL destinations, cloud storage, or queues.
- Terra lab report output includes specimen type, numeric values, bounded values like `>5`, UCUM unit codes, reference ranges, and notes.
- Junction returns structured JSON results alongside raw PDFs.
- Hurdle returns structured JSON test results, biomarker metadata, interpretations, specimen type, and `reportUrlPaths`.
- Practice Better's API is RESTful and available in public beta for paid plans.

Implication:

- The internal data model must support both exact numeric values and non-exact strings like `<7.0`, `>=24`, or text/coded results.
- We should build adapters around webhook/API JSON early.

### 3. FHIR JSON

FHIR should be a first-class ingest format even if many small clinics are not fully FHIR-native yet.

Current evidence:

- The current official US Core version is `8.0.1`.
- US Core defines the floor for U.S. FHIR interoperability and RESTful access.
- Core resources relevant to this product include `Patient`, `Observation`, `DiagnosticReport`, `DocumentReference`, `Bundle`, and `Provenance`.

Implication:

- Our canonical store should be able to ingest:
  - standalone resources
  - search bundles
  - document bundles
- FHIR should be treated as a native adapter, not a later export-only concern.

### 4. Spreadsheet Imports

Spreadsheets remain common in migrations, admin workflows, and wellness/practice platforms.

Current evidence:

- Elation migration accepts demographics and appointment data in `.csv`, `.xls`, `.xlsx`, and `.txt`.
- Practice Better bulk client import uses `CSV`.
- Practice Better exports client contact info and invoices as spreadsheet/CSV outputs.
- Cerbo provides patient spreadsheet exports in `CSV`.

Implication:

- We need a spreadsheet import path for:
  - patient roster seeding
  - demographics
  - appointment history
  - lightweight historical lab exports

### 5. ZIP Packages

ZIP is a real ingest envelope, not an edge case.

Current evidence:

- Cerbo individual chart export downloads as a ZIP package containing `overview.html`, document links, and uploaded photos.
- Cerbo bulk/full data exports can include XML, HTML, and original uploaded files.
- Practice Better client exports are downloaded as ZIP files.
- Practice Better migration guidance expects client documents organized by folder, labeled by patient/client ID or email.

Implication:

- We need a container-ingestion flow that can:
  - unpack ZIPs
  - preserve folder structure
  - map files to patients
  - identify HTML, XML, PDF, images, and spreadsheet contents inside the archive

## Formats By Priority

### Tier 1: Support First

- `PDF`
- `PNG`
- `JPEG`
- `JSON` webhook/API payloads
- `FHIR JSON`
- `CSV`
- `ZIP`

Why:

- These cover the most realistic first-customer workflows.
- They align with Terra, Junction, Hurdle, Cerbo, Elation, and Practice Better realities.

### Tier 2: Support Soon After

- `C-CDA XML`
- `HTML` patient/chart exports
- `XLS`
- `XLSX`
- `TXT`

Why:

- Elation migration explicitly uses XML for key clinical data.
- Cerbo bulk exports include XML and human-readable HTML.
- Spreadsheet and text migration formats remain common.

### Tier 3: Support When Distribution Demands It

- `HL7 v2` lab feeds
- direct queue payloads from partners
- raw provider-specific wearable payloads

Why:

- Valuable, but usually not the fastest first wedge for small and mid-sized longevity / DPC / functional practices.
- Better tackled once core normalization and provenance are already stable.

## Vendor / Platform Reality Check

## Terra

Relevant ingest reality:

- Health and fitness data is pushed to configured destinations rather than always polled.
- Supported destinations include webhooks, SQL databases, cloud storage, and queues.
- The lab report parser accepts `PDF`, `PNG`, `JPEG`, and returns structured biomarker JSON with UCUM-compliant units and reference ranges.
- Apple Health, Samsung Health, and Health Connect are mobile-only sources and require the Terra Mobile SDK.

Implication for us:

- Our connector layer should expect both pushed JSON and uploaded files.
- We should not assume every wearable integration can be done backend-only.

## Junction

Relevant ingest reality:

- Lab results are available as both raw `PDF` and structured `JSON`.
- Result fields can be numeric, range, comment, or coded-value results.
- LOINC fields may be present but are not guaranteed.
- Missing results and failure modes are explicitly modeled.

Implication for us:

- Our schema must tolerate:
  - partial results
  - missing results
  - coded/text values
  - absent LOINC

## Hurdle

Relevant ingest reality:

- Test results are retrievable over API and also announced via webhooks.
- Results include biomarker metadata, interpretation, specimen type, and downloadable report paths.
- Result values may be numeric, categorical, bounded string values, or error text.
- Hurdle also supports embedded iframe-based registration, results, and phlebotomy booking flows.

Implication for us:

- We need to preserve structured JSON plus report attachments.
- We should treat "result" as a flexible field, not numeric-only.

## Elation

Relevant ingest reality:

- Migration formats for demographics and scheduling are `.csv`, `.xls`, `.xlsx`, `.txt`.
- Key clinical data migration is `CCDA` in `.xml`.
- Elation also has a developer platform and sandbox for ongoing integrations.

Implication for us:

- For practice migration and early implementation work, spreadsheet + C-CDA support matters.

## Cerbo

Relevant ingest reality:

- Individual chart export is ZIP + `overview.html` + linked docs/photos.
- Bulk exports include XML and HTML.
- Uploaded documents remain in original formats like PDFs and image files.
- Imported lab results often arrive as `PDF` or `HTML`, with structured values stored separately when available.

Implication for us:

- ZIP and HTML are not optional if we want Cerbo-heavy practices.
- We should support "document plus extracted discrete values" as a first-class pattern.

## Practice Better

Relevant ingest reality:

- Bulk client import is `CSV`.
- API is public beta for paid plans.
- Client export is downloaded as ZIP.
- Migration support expects Excel/CSV plus document folders organized per client.

Implication for us:

- CSV + ZIP + folder-based patient matching should be part of the ingestion roadmap.

## Standards That Should Shape The Canonical Model

### LOINC

LOINC provides universal codes and names for tests, observations, and documents.

Practical rule:

- keep local source code/name
- map to LOINC when possible
- do not assume LOINC is always present

### UCUM

UCUM is the standard code system for unambiguous electronic representation of units.

Practical rule:

- keep original display unit
- store normalized UCUM unit when known
- never overwrite original units blindly

### Provenance

FHIR `Provenance` exists because trust and authenticity matter.

Practical rule:

- every ingest should preserve:
  - source system
  - original file or payload
  - received timestamp
  - observed timestamp
  - transformation notes
  - mapping confidence

## What The Product Schema Must Handle

Minimum ingestion support requirements:

- binary files with mime type
- HTML and XML documents
- structured JSON payloads
- bundles of mixed content
- numeric measurements
- bounded results like `<0.1` or `>99`
- categorical / coded results
- interpretation status
- reference ranges
- specimen type
- local test names and local codes
- optional LOINC
- optional UCUM
- raw source payload preservation

## Recommended Ingestion Architecture

Build adapters by envelope, not by vendor first.

Recommended adapter types:

1. `document_upload`
- PDF / PNG / JPEG / HTML / XML

2. `structured_json`
- Hurdle / Junction / Terra / future partner webhooks

3. `fhir_json`
- single resources and bundles

4. `spreadsheet_import`
- CSV / XLS / XLSX / TXT

5. `zip_package`
- unpack, classify, patient-match, and recurse into contained files

Then add vendor-specific classifiers on top.

## Immediate Build Recommendations

1. Expand the current product from JSON-only intake to file-first intake.
2. Add `source_document` records with:
- mime type
- original filename
- checksum
- byte size
- source system
- patient reference
3. Add a ZIP import pathway early.
4. Add a FHIR JSON adapter before deep HL7 work.
5. Treat non-numeric results as normal, not exceptional.
6. Preserve original names, units, and codes even after canonical mapping.

## Open Questions Worth Researching Next

- Acquire real sample export packages from Cerbo and Practice Better.
- Acquire real sample reports from TruDiagnostic, Hurdle, and other aging vendors.
- Decide whether v1 should OCR scanned image documents internally or rely on an external parser.
- Define the first 100 canonical biomarker mappings with LOINC + unit normalization rules.
- Decide the patient-matching strategy for ZIP/folder imports.

## Sources

- Terra Lab Report API: https://docs.tryterra.co/lab-reports/lab-report-api-documentation
- Terra sources and destinations: https://docs.tryterra.co/health-and-fitness-api/integration-setup/understanding-sources-and-destinations
- Terra destination setup: https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-destinations
- Terra mobile-only sources: https://docs.tryterra.co/health-and-fitness-api/mobile-only-sources
- Terra data source setup: https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-sources
- Junction result formats: https://docs.junction.com/lab/results/result-formats
- Junction results API: https://docs.junction.com/api-reference/results/get-results
- Junction raw provider data: https://docs.junction.com/api-reference/data/profile/get-raw
- Hurdle retrieving results: https://docs.hurdle.bio/docs/retrieving-results
- Hurdle biomarker results API: https://docs.hurdle.bio/reference/get_tests-v2-testid-biomarker-results
- Hurdle developer docs: https://docs.hurdle.bio/
- Hurdle embedded flows: https://docs.hurdle.bio/docs/embedding-user-flows
- Elation migration formats: https://www.elationhealth.com/data-migration/
- Cerbo patient export formats: https://help.cer.bo/support/solutions/articles/8000108600-exporting-patient-data-from-cerbo
- Cerbo imported lab results: https://help.cer.bo/support/solutions/articles/8000009803-imported-lab-results
- Practice Better export: https://help.practicebetter.io/hc/en-us/articles/234807887-Exporting-Client-Records
- Practice Better import: https://help.practicebetter.io/hc/en-us/articles/12078215897755-Importing-Your-Clients
- Practice Better migration FAQ: https://help.practicebetter.io/hc/en-us/articles/33463877188379
- Practice Better API beta: https://help.practicebetter.io/hc/en-us/articles/16637584053275-Getting-Started-with-the-Practice-Better-API-Beta
- LOINC: https://loinc.org/about/
- UCUM: https://ucum.org/about
- FHIR Observation: https://www.hl7.org/fhir/r4/observation.html
- FHIR DiagnosticReport: https://www.hl7.org/fhir/R4/diagnosticreport.html
- FHIR DocumentReference: https://www.hl7.org/fhir/R4/documentreference.html
- FHIR Bundle: https://www.hl7.org/fhir/r4/bundle.html
- FHIR Provenance: https://hl7.org/fhir/R4/provenance.html
- US Core current published version: https://www.hl7.org/fhir/us/core/guidance.html
