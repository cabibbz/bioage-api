# Domain Model

## Canonical Concepts

The product does not start from one global biological-age score.

It starts from canonical concepts that preserve modality and provenance:

- biological-age concepts such as `epigenetic_biological_age`, `pace_of_aging`, `epigenetic_fitness_age`, and `telomere_length`
- core lipid and metabolic concepts such as `apob`, `ldl_cholesterol`, `fasting_glucose`, `fasting_insulin`, and `hba1c`
- inflammatory and hormone concepts such as `inflammation_crp`, `homocysteine`, `il_6`, `testosterone_total`, and `tsh`
- genetic concepts such as `apoe_genotype` and `mthfr_status`
- wearable concepts such as `wearable_hrv_sleep_window`, `wearable_hrv_sdnn`, `resting_heart_rate`, `wearable_spo2`, and `wearable_vo2max_estimate`

Each source value should keep both:

- original vendor/source field
- canonical mapped concept

The canonical catalog now also carries:

- biomarker category
- preferred unit plus optional alternate units
- optional primary LOINC code
- optional reference-range and longevity-target metadata
- normalization notes for known traps such as RMSSD vs SDNN HRV and Lp(a) unit ambiguity

Normalization currently uses that catalog to:

- resolve aliases through a validated shared lookup contract
- convert a small safe alternate-unit set such as HbA1c IFCC mmol/mol, glucose mmol/L, cholesterol mmol/L, and vitamin D nmol/L into preferred units
- preserve explicitly non-convertible alternates such as Lp(a) mg/dL with a flagged note instead of silent conversion

## Persistence Shape

Current local store:

- `patients[]`
- `reportIngestions[]`
- `sourceDocuments[]`
- `parseTasks[]`
- `reviewDecisions[]`
- `measurementPromotions[]`

Current persistence boundary:

- app layer depends on a repository contract
- file-backed JSON remains the default and verified backend
- Postgres runtime now exists behind `PERSISTENCE_BACKEND=postgres`
- source binaries are written through a storage adapter
- the shared canonical catalog is a validated JSON contract used by normalization, review mapping, and verification helpers

Patient records currently include:

- demographic summary
- measurements with either numeric `value` or `textValue`
- timeline events
- clinician focus string

Report-ingestion records currently include:

- vendor
- observed timestamp
- received timestamp
- mapped measurements
- unmapped source entries

Source-document records currently include:

- original filename
- storage path
- storage backend
- storage key
- relative path for local-dev recovery and compaction
- mime type
- byte size
- checksum
- classification
- status
- optional archive manifest
- optional `parentDocumentId` and `archiveEntryPath` for archive-extracted child documents

Parse-task records currently include:

- parser type and mode
- queue/review/completed status
- summary text
- metadata chips
- candidate observation values
- source-document reference

Review-decision records currently include:

- parse task reference
- source document reference
- candidate snapshot
- action: accept, reject, follow-up
- reviewer identity and timestamps
- optional proposed canonical mapping

Measurement-promotion records currently include:

- review decision reference
- parse task reference
- source document reference
- canonical destination
- written measurement id
- promotion timestamp

## Interpretation Rules

The current interpretation layer is intentionally conservative.

- epigenetic metrics default to a provenance-heavy review stance
- wearable metrics default to watch-level review rather than strong claims
- unmapped fields increase the chance that a new record is flagged for review
- intervention events are stored now, but they are not yet linked to measurement windows
- source-document uploads are treated as provenance events first, parsing events second
- extracted child documents inherit archive provenance but still remain first-class source-document records
- parser candidates remain separate from canonical measurements until human review exists
- review decisions remain separate from canonical measurements until explicit promotion occurs
- promoted measurements can now preserve either numeric values or reviewed text/bounded values
- bounded and text-valued report measurements now keep their qualifier or wording explicit in clinician-facing interpretation
- direct report intake now also carries first genetic categorical findings without pretending they are trendable lab values
- the current vendor-specific categorical normalization rules now canonicalize ApoE genotype notation including rs429358/rs7412 SNP phrasing, MTHFR copy-count and dual-negative wording, and the first non-genetic qualitative, bounded, detection-limit, assay-qualified, and positive-or-negative-for-process lab phrases such as `borderline high`, `not detected`, `non-reactive`, `positive`, `<0.3`, or `>90`, while preserving the original notation in report-ingestion notes
- promotion records remain separate from the measurement row so audit trails survive later edits

The system should prefer:

- explicit uncertainty
- modality-specific review
- longitudinal comparison over single-point certainty
