import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const repoRoot = process.cwd();
const storePath = path.join(repoRoot, "data", "store.json");
const outputPath = path.join(repoRoot, "db", "seed-from-store.sql");

function escapeSqlString(value) {
  return value.replace(/'/g, "''");
}

function sqlText(value) {
  if (value === undefined || value === null) {
    return "null";
  }

  return `'${escapeSqlString(String(value))}'`;
}

function sqlNumber(value) {
  return value === undefined || value === null ? "null" : String(value);
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value ?? null))}::jsonb`;
}

function insertStatement(table, columns, rows) {
  if (rows.length === 0) {
    return `-- ${table}: no rows`;
  }

  const values = rows.map((row) => `  (${row.join(", ")})`).join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values}\non conflict do nothing;`;
}

async function main() {
  const store = JSON.parse(await readFile(storePath, "utf8"));

  const patientRows = (store.patients ?? []).map((patient) => [
    sqlText(patient.id),
    sqlText(patient.displayName),
    sqlNumber(patient.chronologicalAge),
    sqlText(patient.focus),
    sqlText(patient.lastReviewedAt),
  ]);

  const measurementRows = (store.patients ?? []).flatMap((patient) =>
    (patient.measurements ?? []).map((measurement) => [
      sqlText(measurement.id),
      sqlText(patient.id),
      sqlText(measurement.canonicalCode),
      sqlText(measurement.title),
      sqlText(measurement.modality),
      sqlText(measurement.sourceVendor),
      sqlText(measurement.observedAt),
      sqlNumber(measurement.value),
      sqlText(measurement.unit),
      sqlText(measurement.interpretation),
      sqlText(measurement.evidenceStatus),
      sqlText(measurement.confidenceLabel),
      sqlText(measurement.deltaLabel),
      "now()",
    ]),
  );

  const timelineRows = (store.patients ?? []).flatMap((patient) =>
    (patient.timeline ?? []).map((event) => [
      sqlText(event.id),
      sqlText(patient.id),
      sqlText(event.type),
      sqlText(event.occurredAt),
      sqlText(event.title),
      sqlText(event.detail),
      "now()",
    ]),
  );

  const reportRows = (store.reportIngestions ?? []).map((ingestion) => [
    sqlText(ingestion.id),
    sqlText(ingestion.patientId),
    sqlText(ingestion.vendor),
    sqlText(ingestion.observedAt),
    sqlText(ingestion.receivedAt),
    sqlJson(ingestion.mappedMeasurements),
    sqlJson(ingestion.unmappedEntries),
  ]);

  const sourceDocumentRows = (store.sourceDocuments ?? []).map((document) => [
    sqlText(document.id),
    sqlText(document.patientId),
    sqlText(document.sourceSystem),
    sqlText(document.ingestionChannel),
    sqlText(document.originalFilename),
    sqlText(document.storedFilename),
    sqlText(document.storageBackend ?? "local_fs"),
    sqlText(document.storageKey ?? document.relativePath),
    sqlText(document.relativePath ?? document.storageKey),
    sqlText(document.mimeType),
    sqlNumber(document.byteSize),
    sqlText(document.checksumSha256),
    sqlText(document.classification),
    sqlText(document.status),
    sqlText(document.receivedAt),
    sqlText(document.observedAt),
    sqlText(document.parentDocumentId),
    sqlText(document.archiveEntryPath),
    sqlJson(document.archiveEntries ?? []),
    "now()",
  ]);

  const parseTaskRows = (store.parseTasks ?? []).map((task) => [
    sqlText(task.id),
    sqlText(task.patientId),
    sqlText(task.sourceDocumentId),
    sqlText(task.sourceDocumentFilename),
    sqlText(task.sourceDocumentClassification),
    sqlText(task.mode),
    sqlText(task.parser),
    sqlText(task.status),
    sqlText(task.summary),
    sqlText(task.detail),
    sqlNumber(task.candidateCount),
    sqlJson(task.metadata),
    sqlJson(task.candidates),
    sqlText(task.errorMessage),
    sqlText(task.createdAt),
    sqlText(task.updatedAt),
  ]);

  const reviewDecisionRows = (store.reviewDecisions ?? []).map((decision) => [
    sqlText(decision.id),
    sqlText(decision.patientId),
    sqlText(decision.parseTaskId),
    sqlText(decision.sourceDocumentId),
    sqlText(decision.candidateId),
    sqlText(decision.candidateDisplayName),
    sqlText(decision.candidateValueLabel),
    sqlText(decision.candidateSourcePath),
    sqlText(decision.action),
    sqlText(decision.reviewerName),
    sqlText(decision.note),
    sqlText(decision.proposedCanonicalCode),
    sqlText(decision.proposedTitle),
    sqlText(decision.proposedModality),
    sqlText(decision.createdAt),
    sqlText(decision.updatedAt),
  ]);

  const promotionRows = (store.measurementPromotions ?? []).map((promotion) => [
    sqlText(promotion.id),
    sqlText(promotion.patientId),
    sqlText(promotion.reviewDecisionId),
    sqlText(promotion.parseTaskId),
    sqlText(promotion.sourceDocumentId),
    sqlText(promotion.canonicalCode),
    sqlText(promotion.title),
    sqlText(promotion.modality),
    sqlText(promotion.measurementId),
    sqlText(promotion.promotedAt),
  ]);

  const statements = [
    "-- Generated from data/store.json",
    "-- Safe for local bootstrap against db/postgres-schema.sql",
    "",
    insertStatement(
      "patients",
      ["id", "display_name", "chronological_age", "focus", "last_reviewed_at"],
      patientRows,
    ),
    "",
    insertStatement(
      "patient_measurements",
      [
        "id",
        "patient_id",
        "canonical_code",
        "title",
        "modality",
        "source_vendor",
        "observed_at",
        "numeric_value",
        "unit",
        "interpretation",
        "evidence_status",
        "confidence_label",
        "delta_label",
        "created_at",
      ],
      measurementRows,
    ),
    "",
    insertStatement(
      "patient_timeline_events",
      ["id", "patient_id", "event_type", "occurred_at", "title", "detail", "created_at"],
      timelineRows,
    ),
    "",
    insertStatement(
      "report_ingestions",
      ["id", "patient_id", "vendor", "observed_at", "received_at", "mapped_measurements", "unmapped_entries"],
      reportRows,
    ),
    "",
    insertStatement(
      "source_documents",
      [
        "id",
        "patient_id",
        "source_system",
        "ingestion_channel",
        "original_filename",
        "stored_filename",
        "storage_backend",
        "storage_key",
        "relative_path",
        "mime_type",
        "byte_size",
        "checksum_sha256",
        "classification",
        "status",
        "received_at",
        "observed_at",
        "parent_document_id",
        "archive_entry_path",
        "archive_entries",
        "created_at",
      ],
      sourceDocumentRows,
    ),
    "",
    insertStatement(
      "parse_tasks",
      [
        "id",
        "patient_id",
        "source_document_id",
        "source_document_filename",
        "source_document_classification",
        "mode",
        "parser",
        "status",
        "summary",
        "detail",
        "candidate_count",
        "metadata",
        "candidates",
        "error_message",
        "created_at",
        "updated_at",
      ],
      parseTaskRows,
    ),
    "",
    insertStatement(
      "review_decisions",
      [
        "id",
        "patient_id",
        "parse_task_id",
        "source_document_id",
        "candidate_id",
        "candidate_display_name",
        "candidate_value_label",
        "candidate_source_path",
        "action",
        "reviewer_name",
        "note",
        "proposed_canonical_code",
        "proposed_title",
        "proposed_modality",
        "created_at",
        "updated_at",
      ],
      reviewDecisionRows,
    ),
    "",
    insertStatement(
      "measurement_promotions",
      [
        "id",
        "patient_id",
        "review_decision_id",
        "parse_task_id",
        "source_document_id",
        "canonical_code",
        "title",
        "modality",
        "measurement_id",
        "promoted_at",
      ],
      promotionRows,
    ),
    "",
  ].join("\n");

  await writeFile(outputPath, statements);
  console.log(`export-postgres-seed: wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(`export-postgres-seed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
