import path from "node:path";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw new Error(`Cannot convert value to ISO string: ${String(value)}`);
}

function readText(row, key) {
  const value = row[key];
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  throw new Error(`Expected ${key} to be string-like.`);
}

function readOptionalText(row, key) {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function readNumber(row, key) {
  const value = row[key];
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Expected ${key} to be numeric.`);
}

function readJson(row, key, fallback) {
  const value = row[key];
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function normalizeStoreFile(store) {
  return {
    patients: store?.patients ?? [],
    reportIngestions: store?.reportIngestions ?? [],
    sourceDocuments: store?.sourceDocuments ?? [],
    parseTasks: store?.parseTasks ?? [],
    reviewDecisions: store?.reviewDecisions ?? [],
    measurementPromotions: store?.measurementPromotions ?? [],
  };
}

async function loadFileSnapshot(repoRoot, patientId) {
  const storePath = path.join(repoRoot, "data", "store.json");
  const store = normalizeStoreFile(JSON.parse(await readFile(storePath, "utf8")));
  const patient = store.patients.find((entry) => entry.id === patientId) ?? null;

  if (!patient) {
    return null;
  }

  return {
    patient,
    reportIngestions: store.reportIngestions.filter((entry) => entry.patientId === patientId),
    sourceDocuments: store.sourceDocuments
      .filter((entry) => entry.patientId === patientId)
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt)),
    parseTasks: store.parseTasks
      .filter((entry) => entry.patientId === patientId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    reviewDecisions: store.reviewDecisions
      .filter((entry) => entry.patientId === patientId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    measurementPromotions: store.measurementPromotions
      .filter((entry) => entry.patientId === patientId)
      .sort((left, right) => right.promotedAt.localeCompare(left.promotedAt)),
  };
}

function buildPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when loading persisted Postgres snapshots.");
  }

  const sslMode = process.env.PGSSLMODE?.trim().toLowerCase();

  return new Pool({
    connectionString,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

async function queryRows(executor, text, values = []) {
  const result = await executor.query(text, values);
  return result.rows;
}

async function queryOne(executor, text, values = []) {
  const rows = await queryRows(executor, text, values);
  return rows[0] ?? null;
}

function deriveRelativePath(storageBackend, storageKey) {
  if (storageBackend === "local_fs" && storageKey.startsWith("uploads/")) {
    return `data/${storageKey}`;
  }

  return storageKey;
}

function mapMeasurement(row) {
  return {
    id: readText(row, "id"),
    title: readText(row, "title"),
    canonicalCode: readText(row, "canonical_code"),
    modality: readText(row, "modality"),
    sourceVendor: readText(row, "source_vendor"),
    observedAt: toIsoString(row.observed_at),
    value: readNumber(row, "numeric_value"),
    unit: readOptionalText(row, "unit"),
    interpretation: readText(row, "interpretation"),
    evidenceStatus: readText(row, "evidence_status"),
    confidenceLabel: readText(row, "confidence_label"),
    deltaLabel: readOptionalText(row, "delta_label"),
  };
}

function mapTimelineEvent(row) {
  return {
    id: readText(row, "id"),
    type: readText(row, "event_type"),
    occurredAt: toIsoString(row.occurred_at),
    title: readText(row, "title"),
    detail: readText(row, "detail"),
  };
}

function mapReportIngestion(row) {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    vendor: readText(row, "vendor"),
    observedAt: toIsoString(row.observed_at),
    receivedAt: toIsoString(row.received_at),
    mappedMeasurements: readJson(row, "mapped_measurements", []),
    unmappedEntries: readJson(row, "unmapped_entries", []),
  };
}

function mapSourceDocument(row) {
  const storageBackend = readText(row, "storage_backend");
  const storageKey = readText(row, "storage_key");
  const archiveEntries = readJson(row, "archive_entries", []);

  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    sourceSystem: readText(row, "source_system"),
    ingestionChannel: readText(row, "ingestion_channel"),
    originalFilename: readText(row, "original_filename"),
    storedFilename: readText(row, "stored_filename"),
    storageBackend,
    storageKey,
    relativePath: readOptionalText(row, "relative_path") ?? deriveRelativePath(storageBackend, storageKey),
    mimeType: readText(row, "mime_type"),
    byteSize: readNumber(row, "byte_size"),
    checksumSha256: readText(row, "checksum_sha256"),
    classification: readText(row, "classification"),
    status: readText(row, "status"),
    receivedAt: toIsoString(row.received_at),
    observedAt: row.observed_at ? toIsoString(row.observed_at) : undefined,
    parentDocumentId: readOptionalText(row, "parent_document_id"),
    archiveEntryPath: readOptionalText(row, "archive_entry_path"),
    archiveEntries: archiveEntries.length > 0 ? archiveEntries : undefined,
  };
}

function mapParseTask(row) {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    sourceDocumentId: readText(row, "source_document_id"),
    sourceDocumentFilename: readText(row, "source_document_filename"),
    sourceDocumentClassification: readText(row, "source_document_classification"),
    mode: readText(row, "mode"),
    parser: readText(row, "parser"),
    status: readText(row, "status"),
    summary: readText(row, "summary"),
    detail: readText(row, "detail"),
    candidateCount: readNumber(row, "candidate_count"),
    metadata: readJson(row, "metadata", []),
    candidates: readJson(row, "candidates", []),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    errorMessage: readOptionalText(row, "error_message"),
  };
}

function mapReviewDecision(row) {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    parseTaskId: readText(row, "parse_task_id"),
    sourceDocumentId: readText(row, "source_document_id"),
    candidateId: readText(row, "candidate_id"),
    candidateDisplayName: readText(row, "candidate_display_name"),
    candidateValueLabel: readText(row, "candidate_value_label"),
    candidateSourcePath: readText(row, "candidate_source_path"),
    action: readText(row, "action"),
    reviewerName: readText(row, "reviewer_name"),
    note: readOptionalText(row, "note"),
    proposedCanonicalCode: readOptionalText(row, "proposed_canonical_code"),
    proposedTitle: readOptionalText(row, "proposed_title"),
    proposedModality: readOptionalText(row, "proposed_modality"),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMeasurementPromotion(row) {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    reviewDecisionId: readText(row, "review_decision_id"),
    parseTaskId: readText(row, "parse_task_id"),
    sourceDocumentId: readText(row, "source_document_id"),
    canonicalCode: readText(row, "canonical_code"),
    title: readText(row, "title"),
    modality: readText(row, "modality"),
    measurementId: readText(row, "measurement_id"),
    promotedAt: toIsoString(row.promoted_at),
  };
}

async function loadPostgresPatient(pool, patientId) {
  const patientRow = await queryOne(
    pool,
    `select id, display_name, chronological_age, focus, last_reviewed_at
      from patients
      where id = $1`,
    [patientId],
  );

  if (!patientRow) {
    return null;
  }

  const measurementRows = await queryRows(
    pool,
    `select id, canonical_code, title, modality, source_vendor, observed_at, numeric_value, unit,
            interpretation, evidence_status, confidence_label, delta_label
      from patient_measurements
      where patient_id = $1
      order by observed_at desc, created_at desc`,
    [patientId],
  );

  const timelineRows = await queryRows(
    pool,
    `select id, event_type, occurred_at, title, detail
      from patient_timeline_events
      where patient_id = $1
      order by occurred_at desc, created_at desc`,
    [patientId],
  );

  return {
    id: readText(patientRow, "id"),
    displayName: readText(patientRow, "display_name"),
    chronologicalAge: readNumber(patientRow, "chronological_age"),
    focus: readText(patientRow, "focus"),
    lastReviewedAt: toIsoString(patientRow.last_reviewed_at),
    measurements: measurementRows.map(mapMeasurement),
    timeline: timelineRows.map(mapTimelineEvent),
  };
}

async function loadPostgresSnapshot(patientId) {
  const pool = buildPool();

  try {
    const patient = await loadPostgresPatient(pool, patientId);

    if (!patient) {
      return null;
    }

    const [reportIngestions, sourceDocuments, parseTasks, reviewDecisions, measurementPromotions] = await Promise.all([
      queryRows(
        pool,
        `select *
          from report_ingestions
          where patient_id = $1
          order by received_at desc`,
        [patientId],
      ).then((rows) => rows.map(mapReportIngestion)),
      queryRows(
        pool,
        `select *
          from source_documents
          where patient_id = $1
          order by received_at desc, created_at desc`,
        [patientId],
      ).then((rows) => rows.map(mapSourceDocument)),
      queryRows(
        pool,
        `select *
          from parse_tasks
          where patient_id = $1
          order by updated_at desc, created_at desc`,
        [patientId],
      ).then((rows) => rows.map(mapParseTask)),
      queryRows(
        pool,
        `select *
          from review_decisions
          where patient_id = $1
          order by updated_at desc, created_at desc`,
        [patientId],
      ).then((rows) => rows.map(mapReviewDecision)),
      queryRows(
        pool,
        `select *
          from measurement_promotions
          where patient_id = $1
          order by promoted_at desc`,
        [patientId],
      ).then((rows) => rows.map(mapMeasurementPromotion)),
    ]);

    return {
      patient,
      reportIngestions,
      sourceDocuments,
      parseTasks,
      reviewDecisions,
      measurementPromotions,
    };
  } finally {
    await pool.end();
  }
}

export async function loadPersistedPatientSnapshot(options = {}) {
  const backend = options.backend?.trim().toLowerCase() === "postgres" ? "postgres" : "file";
  const patientId = options.patientId?.trim();
  const repoRoot = options.repoRoot ?? process.cwd();

  if (!patientId) {
    throw new Error("patientId is required to load a persisted patient snapshot.");
  }

  if (backend === "postgres") {
    return loadPostgresSnapshot(patientId);
  }

  return loadFileSnapshot(repoRoot, patientId);
}
