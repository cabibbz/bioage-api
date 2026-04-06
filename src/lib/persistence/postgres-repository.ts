import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { MeasurementModality, PatientRecord, TimelineEvent } from "@/src/lib/domain/types";
import {
  classifyArchiveEntry,
  classifySourceDocument,
  inferMimeTypeFromFilename,
} from "@/src/lib/ingestion/classify";
import { canonicalCatalog } from "@/src/lib/normalization/catalog";
import { runParseTask, toSourceDocumentStatus } from "@/src/lib/parsing/task-runner";
import {
  buildDocumentStatus,
  summarizeArchiveExtraction,
  summarizeMeasurement,
  summarizeSourceDocument,
  toPatientMeasurement,
} from "@/src/lib/persistence/evidence-logic";
import { getPostgresPool, toIsoString, withPostgresTransaction } from "@/src/lib/persistence/postgres-client";
import {
  EvidenceRepository,
  PersistNormalizedReportInput,
  PersistSourceDocumentUploadInput,
} from "@/src/lib/persistence/repository";
import {
  ParsedMeasurementCandidate,
  StoredArchiveEntry,
  StoredMeasurementPromotion,
  StoredParseTask,
  StoredReportIngestion,
  StoredReviewDecision,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";
import { getBinaryStorageRepository } from "@/src/lib/storage";

type DbRow = Record<string, unknown>;
type Queryable = {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: DbRow[] }>;
};

function readText(row: DbRow, key: string): string {
  const value = row[key];
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  throw new Error(`Expected ${key} to be a string-like value.`);
}

function readOptionalText(row: DbRow, key: string): string | undefined {
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

function readNumber(row: DbRow, key: string): number {
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

function readJson<T>(row: DbRow, key: string, fallback: T): T {
  const value = row[key];
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

async function queryRows(executor: Queryable, text: string, values: readonly unknown[] = []) {
  const result = await executor.query(text, values);
  return result.rows;
}

async function queryOne(executor: Queryable, text: string, values: readonly unknown[] = []) {
  const rows = await queryRows(executor, text, values);
  return rows[0] ?? null;
}

function deriveRelativePath(storageBackend: StoredSourceDocument["storageBackend"], storageKey: string) {
  if (storageBackend === "local_fs" && storageKey.startsWith("uploads/")) {
    return `data/${storageKey}`;
  }

  return storageKey;
}

function mapMeasurement(row: DbRow): PatientRecord["measurements"][number] {
  return {
    id: readText(row, "id"),
    title: readText(row, "title"),
    canonicalCode: readText(row, "canonical_code"),
    modality: readText(row, "modality") as MeasurementModality,
    sourceVendor: readText(row, "source_vendor"),
    observedAt: toIsoString(row.observed_at),
    value: readNumber(row, "numeric_value"),
    unit: readOptionalText(row, "unit"),
    interpretation: readText(row, "interpretation"),
    evidenceStatus: readText(row, "evidence_status") as PatientRecord["measurements"][number]["evidenceStatus"],
    confidenceLabel: readText(row, "confidence_label") as PatientRecord["measurements"][number]["confidenceLabel"],
    deltaLabel: readOptionalText(row, "delta_label"),
  };
}

function mapTimelineEvent(row: DbRow): TimelineEvent {
  return {
    id: readText(row, "id"),
    type: readText(row, "event_type") as TimelineEvent["type"],
    occurredAt: toIsoString(row.occurred_at),
    title: readText(row, "title"),
    detail: readText(row, "detail"),
  };
}

function mapReportIngestion(row: DbRow): StoredReportIngestion {
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

function mapSourceDocument(row: DbRow): StoredSourceDocument {
  const storedFilename = readText(row, "stored_filename");
  const storageBackend = readText(row, "storage_backend") as StoredSourceDocument["storageBackend"];
  const storageKey = readText(row, "storage_key");
  const archiveEntries = readJson<StoredArchiveEntry[]>(row, "archive_entries", []);

  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    sourceSystem: readText(row, "source_system"),
    ingestionChannel: readText(row, "ingestion_channel") as StoredSourceDocument["ingestionChannel"],
    originalFilename: readText(row, "original_filename"),
    storedFilename,
    storageBackend,
    storageKey,
    relativePath: readOptionalText(row, "relative_path") ?? deriveRelativePath(storageBackend, storageKey),
    mimeType: readText(row, "mime_type"),
    byteSize: readNumber(row, "byte_size"),
    checksumSha256: readText(row, "checksum_sha256"),
    classification: readText(row, "classification") as StoredSourceDocument["classification"],
    status: readText(row, "status") as StoredSourceDocument["status"],
    receivedAt: toIsoString(row.received_at),
    observedAt: row.observed_at ? toIsoString(row.observed_at) : undefined,
    parentDocumentId: readOptionalText(row, "parent_document_id"),
    archiveEntryPath: readOptionalText(row, "archive_entry_path"),
    archiveEntries: archiveEntries.length > 0 ? archiveEntries : undefined,
  };
}

function mapParseTask(row: DbRow): StoredParseTask {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    sourceDocumentId: readText(row, "source_document_id"),
    sourceDocumentFilename: readText(row, "source_document_filename"),
    sourceDocumentClassification: readText(
      row,
      "source_document_classification",
    ) as StoredParseTask["sourceDocumentClassification"],
    mode: readText(row, "mode") as StoredParseTask["mode"],
    parser: readText(row, "parser") as StoredParseTask["parser"],
    status: readText(row, "status") as StoredParseTask["status"],
    summary: readText(row, "summary"),
    detail: readText(row, "detail"),
    candidateCount: readNumber(row, "candidate_count"),
    metadata: readJson(row, "metadata", []),
    candidates: readJson<ParsedMeasurementCandidate[]>(row, "candidates", []),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    errorMessage: readOptionalText(row, "error_message"),
  };
}

function mapReviewDecision(row: DbRow): StoredReviewDecision {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    parseTaskId: readText(row, "parse_task_id"),
    sourceDocumentId: readText(row, "source_document_id"),
    candidateId: readText(row, "candidate_id"),
    candidateDisplayName: readText(row, "candidate_display_name"),
    candidateValueLabel: readText(row, "candidate_value_label"),
    candidateSourcePath: readText(row, "candidate_source_path"),
    action: readText(row, "action") as StoredReviewDecision["action"],
    reviewerName: readText(row, "reviewer_name"),
    note: readOptionalText(row, "note"),
    proposedCanonicalCode: readOptionalText(row, "proposed_canonical_code"),
    proposedTitle: readOptionalText(row, "proposed_title"),
    proposedModality: readOptionalText(row, "proposed_modality") as StoredReviewDecision["proposedModality"],
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMeasurementPromotion(row: DbRow): StoredMeasurementPromotion {
  return {
    id: readText(row, "id"),
    patientId: readText(row, "patient_id"),
    reviewDecisionId: readText(row, "review_decision_id"),
    parseTaskId: readText(row, "parse_task_id"),
    sourceDocumentId: readText(row, "source_document_id"),
    canonicalCode: readText(row, "canonical_code"),
    title: readText(row, "title"),
    modality: readText(row, "modality") as StoredMeasurementPromotion["modality"],
    measurementId: readText(row, "measurement_id"),
    promotedAt: toIsoString(row.promoted_at),
  };
}

async function requirePatient(executor: Queryable, patientId: string, options?: { forUpdate?: boolean }) {
  const row = await queryOne(
    executor,
    `select id
      from patients
      where id = $1${options?.forUpdate ? " for update" : ""}`,
    [patientId],
  );

  if (!row) {
    throw new Error(`Patient ${patientId} was not found.`);
  }
}

async function loadPatientRecord(executor: Queryable, patientId: string): Promise<PatientRecord | null> {
  const patientRow = await queryOne(
    executor,
    `select id, display_name, chronological_age, focus, last_reviewed_at
      from patients
      where id = $1`,
    [patientId],
  );

  if (!patientRow) {
    return null;
  }

  const measurementRows = await queryRows(
    executor,
    `select id, canonical_code, title, modality, source_vendor, observed_at, numeric_value, unit,
            interpretation, evidence_status, confidence_label, delta_label
      from patient_measurements
      where patient_id = $1
      order by observed_at desc, created_at desc`,
    [patientId],
  );

  const timelineRows = await queryRows(
    executor,
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

async function findParseTask(executor: Queryable, patientId: string, parseTaskId: string) {
  const row = await queryOne(
    executor,
    `select *
      from parse_tasks
      where id = $1 and patient_id = $2`,
    [parseTaskId, patientId],
  );

  return row ? mapParseTask(row) : null;
}

async function findSourceDocument(executor: Queryable, sourceDocumentId: string) {
  const row = await queryOne(
    executor,
    `select *
      from source_documents
      where id = $1`,
    [sourceDocumentId],
  );

  return row ? mapSourceDocument(row) : null;
}

async function findReviewDecision(executor: Queryable, patientId: string, reviewDecisionId: string) {
  const row = await queryOne(
    executor,
    `select *
      from review_decisions
      where id = $1 and patient_id = $2`,
    [reviewDecisionId, patientId],
  );

  return row ? mapReviewDecision(row) : null;
}

async function findMeasurementPromotionByDecision(
  executor: Queryable,
  patientId: string,
  reviewDecisionId: string,
) {
  const row = await queryOne(
    executor,
    `select *
      from measurement_promotions
      where patient_id = $1 and review_decision_id = $2`,
    [patientId, reviewDecisionId],
  );

  return row ? mapMeasurementPromotion(row) : null;
}

async function updatePatientLastReviewed(executor: Queryable, patientId: string, reviewedAt: string) {
  await executor.query(
    `update patients
      set last_reviewed_at = $2
      where id = $1`,
    [patientId, reviewedAt],
  );
}

async function insertTimelineEvent(
  executor: Queryable,
  patientId: string,
  event: TimelineEvent,
  createdAt: string,
) {
  await executor.query(
    `insert into patient_timeline_events (
      id,
      patient_id,
      event_type,
      occurred_at,
      title,
      detail,
      created_at
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [event.id, patientId, event.type, event.occurredAt, event.title, event.detail, createdAt],
  );
}

async function insertMeasurement(
  executor: Queryable,
  patientId: string,
  measurement: PatientRecord["measurements"][number],
  createdAt: string,
) {
  await executor.query(
    `insert into patient_measurements (
      id,
      patient_id,
      canonical_code,
      title,
      modality,
      source_vendor,
      observed_at,
      numeric_value,
      unit,
      interpretation,
      evidence_status,
      confidence_label,
      delta_label,
      created_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      measurement.id,
      patientId,
      measurement.canonicalCode,
      measurement.title,
      measurement.modality,
      measurement.sourceVendor,
      measurement.observedAt,
      measurement.value,
      measurement.unit ?? null,
      measurement.interpretation,
      measurement.evidenceStatus,
      measurement.confidenceLabel,
      measurement.deltaLabel ?? null,
      createdAt,
    ],
  );
}

async function insertReportIngestion(executor: Queryable, ingestion: StoredReportIngestion) {
  await executor.query(
    `insert into report_ingestions (
      id,
      patient_id,
      vendor,
      observed_at,
      received_at,
      mapped_measurements,
      unmapped_entries
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      ingestion.id,
      ingestion.patientId,
      ingestion.vendor,
      ingestion.observedAt,
      ingestion.receivedAt,
      JSON.stringify(ingestion.mappedMeasurements),
      JSON.stringify(ingestion.unmappedEntries),
    ],
  );
}

async function insertSourceDocument(executor: Queryable, document: StoredSourceDocument) {
  await executor.query(
    `insert into source_documents (
      id,
      patient_id,
      source_system,
      ingestion_channel,
      original_filename,
      stored_filename,
      storage_backend,
      storage_key,
      relative_path,
      mime_type,
      byte_size,
      checksum_sha256,
      classification,
      status,
      received_at,
      observed_at,
      parent_document_id,
      archive_entry_path,
      archive_entries,
      created_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20
    )`,
    [
      document.id,
      document.patientId,
      document.sourceSystem,
      document.ingestionChannel,
      document.originalFilename,
      document.storedFilename,
      document.storageBackend,
      document.storageKey,
      document.relativePath,
      document.mimeType,
      document.byteSize,
      document.checksumSha256,
      document.classification,
      document.status,
      document.receivedAt,
      document.observedAt ?? null,
      document.parentDocumentId ?? null,
      document.archiveEntryPath ?? null,
      JSON.stringify(document.archiveEntries ?? []),
      document.receivedAt,
    ],
  );
}

async function insertParseTask(executor: Queryable, task: StoredParseTask) {
  await executor.query(
    `insert into parse_tasks (
      id,
      patient_id,
      source_document_id,
      source_document_filename,
      source_document_classification,
      mode,
      parser,
      status,
      summary,
      detail,
      candidate_count,
      metadata,
      candidates,
      error_message,
      created_at,
      updated_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16
    )`,
    [
      task.id,
      task.patientId,
      task.sourceDocumentId,
      task.sourceDocumentFilename,
      task.sourceDocumentClassification,
      task.mode,
      task.parser,
      task.status,
      task.summary,
      task.detail,
      task.candidateCount,
      JSON.stringify(task.metadata),
      JSON.stringify(task.candidates),
      task.errorMessage ?? null,
      task.createdAt,
      task.updatedAt,
    ],
  );
}

async function insertReviewDecision(executor: Queryable, decision: StoredReviewDecision) {
  await executor.query(
    `insert into review_decisions (
      id,
      patient_id,
      parse_task_id,
      source_document_id,
      candidate_id,
      candidate_display_name,
      candidate_value_label,
      candidate_source_path,
      action,
      reviewer_name,
      note,
      proposed_canonical_code,
      proposed_title,
      proposed_modality,
      created_at,
      updated_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16
    )`,
    [
      decision.id,
      decision.patientId,
      decision.parseTaskId,
      decision.sourceDocumentId,
      decision.candidateId,
      decision.candidateDisplayName,
      decision.candidateValueLabel,
      decision.candidateSourcePath,
      decision.action,
      decision.reviewerName,
      decision.note ?? null,
      decision.proposedCanonicalCode ?? null,
      decision.proposedTitle ?? null,
      decision.proposedModality ?? null,
      decision.createdAt,
      decision.updatedAt,
    ],
  );
}

async function updateReviewDecision(executor: Queryable, decision: StoredReviewDecision) {
  await executor.query(
    `update review_decisions
      set action = $2,
          reviewer_name = $3,
          note = $4,
          proposed_canonical_code = $5,
          proposed_title = $6,
          proposed_modality = $7,
          updated_at = $8
      where id = $1`,
    [
      decision.id,
      decision.action,
      decision.reviewerName,
      decision.note ?? null,
      decision.proposedCanonicalCode ?? null,
      decision.proposedTitle ?? null,
      decision.proposedModality ?? null,
      decision.updatedAt,
    ],
  );
}

async function insertMeasurementPromotion(executor: Queryable, promotion: StoredMeasurementPromotion) {
  await executor.query(
    `insert into measurement_promotions (
      id,
      patient_id,
      review_decision_id,
      parse_task_id,
      source_document_id,
      canonical_code,
      title,
      modality,
      measurement_id,
      promoted_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      promotion.id,
      promotion.patientId,
      promotion.reviewDecisionId,
      promotion.parseTaskId,
      promotion.sourceDocumentId,
      promotion.canonicalCode,
      promotion.title,
      promotion.modality,
      promotion.measurementId,
      promotion.promotedAt,
    ],
  );
}

export const postgresEvidenceRepository: EvidenceRepository = {
  async getPatientRecord(patientId) {
    return loadPatientRecord(getPostgresPool(), patientId);
  },

  async listReportIngestions(patientId) {
    const rows = await queryRows(
      getPostgresPool(),
      `select *
        from report_ingestions
        where patient_id = $1
        order by received_at desc`,
      [patientId],
    );

    return rows.map(mapReportIngestion);
  },

  async listSourceDocuments(patientId) {
    const rows = await queryRows(
      getPostgresPool(),
      `select *
        from source_documents
        where patient_id = $1
        order by received_at desc, created_at desc`,
      [patientId],
    );

    return rows.map(mapSourceDocument);
  },

  async listParseTasks(patientId) {
    const rows = await queryRows(
      getPostgresPool(),
      `select *
        from parse_tasks
        where patient_id = $1
        order by updated_at desc, created_at desc`,
      [patientId],
    );

    return rows.map(mapParseTask);
  },

  async listReviewDecisions(patientId) {
    const rows = await queryRows(
      getPostgresPool(),
      `select *
        from review_decisions
        where patient_id = $1
        order by updated_at desc, created_at desc`,
      [patientId],
    );

    return rows.map(mapReviewDecision);
  },

  async listMeasurementPromotions(patientId) {
    const rows = await queryRows(
      getPostgresPool(),
      `select *
        from measurement_promotions
        where patient_id = $1
        order by promoted_at desc`,
      [patientId],
    );

    return rows.map(mapMeasurementPromotion);
  },

  async persistNormalizedReport(payload: PersistNormalizedReportInput) {
    return withPostgresTransaction(async (client) => {
      await requirePatient(client, payload.patientId, { forUpdate: true });

      const now = new Date().toISOString();
      const measurements = payload.measurements.map((measurement) =>
        toPatientMeasurement(measurement, payload.unmappedEntries),
      );

      const ingestion: StoredReportIngestion = {
        id: randomUUID(),
        patientId: payload.patientId,
        vendor: payload.vendor,
        observedAt: payload.observedAt,
        receivedAt: now,
        mappedMeasurements: payload.measurements,
        unmappedEntries: payload.unmappedEntries,
      };

      const measurementSummary = payload.measurements.length
        ? payload.measurements.map(summarizeMeasurement).join("; ")
        : "No canonical metrics were mapped";

      const timelineEvent: TimelineEvent = {
        id: randomUUID(),
        type: "assessment",
        occurredAt: payload.observedAt,
        title: `${payload.vendor} report normalized`,
        detail:
          payload.unmappedEntries.length > 0
            ? `${measurementSummary}. ${payload.unmappedEntries.length} source fields still require mapping review.`
            : measurementSummary,
      };

      for (const measurement of measurements) {
        await insertMeasurement(client, payload.patientId, measurement, now);
      }

      await insertReportIngestion(client, ingestion);
      await insertTimelineEvent(client, payload.patientId, timelineEvent, now);
      await updatePatientLastReviewed(client, payload.patientId, now);

      const patient = await loadPatientRecord(client, payload.patientId);
      if (!patient) {
        throw new Error(`Patient ${payload.patientId} disappeared during report persistence.`);
      }

      return {
        patient,
        ingestion,
      };
    });
  },

  async addInterventionEvent(input) {
    return withPostgresTransaction(async (client) => {
      await requirePatient(client, input.patientId, { forUpdate: true });

      const now = new Date().toISOString();
      const interventionEvent: TimelineEvent = {
        id: randomUUID(),
        type: "intervention",
        occurredAt: input.occurredAt,
        title: input.title,
        detail: input.detail,
      };

      await insertTimelineEvent(client, input.patientId, interventionEvent, now);
      await updatePatientLastReviewed(client, input.patientId, now);

      const patient = await loadPatientRecord(client, input.patientId);
      if (!patient) {
        throw new Error(`Patient ${input.patientId} disappeared during intervention persistence.`);
      }

      return patient;
    });
  },

  async persistSourceDocumentUpload(input: PersistSourceDocumentUploadInput) {
    await requirePatient(getPostgresPool(), input.patientId);

    const binaryStorage = getBinaryStorageRepository();
    await binaryStorage.ensureReady();

    const documentId = randomUUID();
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    const classification = classifySourceDocument({
      filename: input.originalFilename,
      mimeType: input.mimeType,
      bytes: input.bytes,
    });

    let archiveEntries: StoredArchiveEntry[] | undefined;
    let extractedChildDocuments: StoredSourceDocument[] = [];
    const parseInputs: Array<{ document: StoredSourceDocument; bytes?: Buffer }> = [];

    if (classification === "zip_archive") {
      const zip = await JSZip.loadAsync(input.bytes);
      const fileEntries = Object.values(zip.files);

      archiveEntries = await Promise.all(
        fileEntries.map(async (entry) =>
          classifyArchiveEntry(entry.name, entry.dir, entry.dir ? undefined : await entry.async("nodebuffer")),
        ),
      );

      const supportedEntries = archiveEntries.filter(
        (entry) => !entry.isDirectory && entry.classification !== "unknown" && entry.classification !== "zip_archive",
      );

      const extractedChildren = await Promise.all(
        supportedEntries.map(async (entry) => {
          const zipEntry = zip.files[entry.path];

          if (!zipEntry) {
            throw new Error(`ZIP entry ${entry.path} was classified but could not be re-opened.`);
          }

          const childBytes = await zipEntry.async("nodebuffer");
          const storedBinary = await binaryStorage.writeBinary({
            filenameHint: entry.path,
            bytes: childBytes,
          });

          const receivedAt = new Date().toISOString();
          const document: StoredSourceDocument = {
            id: randomUUID(),
            patientId: input.patientId,
            sourceSystem: input.sourceSystem,
            ingestionChannel: "archive_extract",
            originalFilename: path.basename(entry.path),
            storedFilename: storedBinary.storedFilename,
            storageBackend: storedBinary.backend,
            storageKey: storedBinary.storageKey,
            relativePath: storedBinary.relativePath,
            mimeType: inferMimeTypeFromFilename(entry.path),
            byteSize: childBytes.length,
            checksumSha256: createHash("sha256").update(childBytes).digest("hex"),
            classification: entry.classification,
            status: buildDocumentStatus(entry.classification),
            receivedAt,
            observedAt: input.observedAt,
            parentDocumentId: documentId,
            archiveEntryPath: entry.path,
          };

          return {
            document,
            bytes: childBytes,
          };
        }),
      );

      extractedChildDocuments = extractedChildren.map((entry) => entry.document);
      parseInputs.push(...extractedChildren);
    }

    const storedBinary = await binaryStorage.writeBinary({
      filenameHint: `${documentId}${path.extname(input.originalFilename) || ".bin"}`,
      bytes: input.bytes,
    });

    const receivedAt = new Date().toISOString();
    const document: StoredSourceDocument = {
      id: documentId,
      patientId: input.patientId,
      sourceSystem: input.sourceSystem,
      ingestionChannel: "manual_upload",
      originalFilename: input.originalFilename,
      storedFilename: storedBinary.storedFilename,
      storageBackend: storedBinary.backend,
      storageKey: storedBinary.storageKey,
      relativePath: storedBinary.relativePath,
      mimeType: input.mimeType || "application/octet-stream",
      byteSize: input.bytes.length,
      checksumSha256,
      classification,
      status: buildDocumentStatus(classification),
      receivedAt,
      observedAt: input.observedAt,
      archiveEntries,
    };

    parseInputs.unshift({
      document,
      bytes: input.bytes,
    });

    const parseTasks = parseInputs.map((parseInput) => runParseTask(parseInput));
    const parseTasksByDocumentId = new Map(parseTasks.map((task) => [task.sourceDocumentId, task]));

    const parsedDocument: StoredSourceDocument = {
      ...document,
      status: toSourceDocumentStatus(document, parseTasksByDocumentId.get(document.id) ?? parseTasks[0]),
    };

    const parsedChildDocuments = extractedChildDocuments.map((childDocument) => {
      const task = parseTasksByDocumentId.get(childDocument.id);
      return task
        ? {
            ...childDocument,
            status: toSourceDocumentStatus(childDocument, task),
          }
        : childDocument;
    });

    const timelineEvent: TimelineEvent = {
      id: randomUUID(),
      type: "note",
      occurredAt: parsedDocument.receivedAt,
      title:
        classification === "zip_archive"
          ? `${input.sourceSystem} archive uploaded`
          : `${input.sourceSystem} document uploaded`,
      detail:
        classification === "zip_archive"
          ? `${summarizeArchiveExtraction(parsedDocument, parsedChildDocuments)} ${parseTasks.length} parse tasks created.`
          : `${summarizeSourceDocument(parsedDocument)} ${parseTasks.length} parse task created.`,
    };

    return withPostgresTransaction(async (client) => {
      await requirePatient(client, input.patientId, { forUpdate: true });

      await insertSourceDocument(client, parsedDocument);
      for (const childDocument of parsedChildDocuments) {
        await insertSourceDocument(client, childDocument);
      }

      for (const task of parseTasks) {
        await insertParseTask(client, task);
      }

      await insertTimelineEvent(client, input.patientId, timelineEvent, parsedDocument.receivedAt);
      await updatePatientLastReviewed(client, input.patientId, parsedDocument.receivedAt);

      const patient = await loadPatientRecord(client, input.patientId);
      if (!patient) {
        throw new Error(`Patient ${input.patientId} disappeared during document persistence.`);
      }

      return {
        patient,
        document: parsedDocument,
        extractedChildDocuments: parsedChildDocuments,
        parseTasks,
      };
    });
  },

  async persistReviewDecision(input) {
    return withPostgresTransaction(async (client) => {
      await requirePatient(client, input.patientId, { forUpdate: true });

      const parseTask = await findParseTask(client, input.patientId, input.parseTaskId);
      if (!parseTask) {
        throw new Error(`Parse task ${input.parseTaskId} was not found.`);
      }

      const candidate = parseTask.candidates.find((entry) => entry.id === input.candidateId);
      if (!candidate) {
        throw new Error(`Candidate ${input.candidateId} was not found on parse task ${input.parseTaskId}.`);
      }

      const canonicalMatch = input.proposedCanonicalCode
        ? canonicalCatalog.find((item) => item.canonicalCode === input.proposedCanonicalCode)
        : undefined;

      if (input.proposedCanonicalCode && !canonicalMatch) {
        throw new Error(`Canonical code ${input.proposedCanonicalCode} is not in the catalog.`);
      }

      const existingDecision = await queryOne(
        client,
        `select *
          from review_decisions
          where patient_id = $1 and parse_task_id = $2 and candidate_id = $3`,
        [input.patientId, input.parseTaskId, input.candidateId],
      );

      if (existingDecision) {
        const existingPromotion = await findMeasurementPromotionByDecision(
          client,
          input.patientId,
          readText(existingDecision, "id"),
        );

        if (existingPromotion) {
          throw new Error(`Review decision ${existingPromotion.reviewDecisionId} was already promoted and cannot be changed.`);
        }
      }

      const now = new Date().toISOString();
      const decision: StoredReviewDecision = {
        id: existingDecision ? readText(existingDecision, "id") : randomUUID(),
        patientId: input.patientId,
        parseTaskId: input.parseTaskId,
        sourceDocumentId: parseTask.sourceDocumentId,
        candidateId: candidate.id,
        candidateDisplayName: candidate.displayName,
        candidateValueLabel: candidate.valueLabel,
        candidateSourcePath: candidate.sourcePath,
        action: input.action,
        reviewerName: input.reviewerName,
        note: input.note?.trim() ? input.note.trim() : undefined,
        proposedCanonicalCode: canonicalMatch?.canonicalCode,
        proposedTitle: canonicalMatch?.title,
        proposedModality: canonicalMatch?.modality,
        createdAt: existingDecision ? toIsoString(existingDecision.created_at) : now,
        updatedAt: now,
      };

      if (existingDecision) {
        await updateReviewDecision(client, decision);
      } else {
        await insertReviewDecision(client, decision);
      }

      const actionLabel =
        input.action === "accept"
          ? "accepted"
          : input.action === "reject"
            ? "rejected"
            : "flagged for follow-up";
      const mappingLabel = canonicalMatch
        ? ` Proposed mapping: ${canonicalMatch.title} (${canonicalMatch.canonicalCode}).`
        : "";

      const reviewEvent: TimelineEvent = {
        id: randomUUID(),
        type: "note",
        occurredAt: now,
        title: `${candidate.displayName} ${actionLabel}`,
        detail: `${input.reviewerName} reviewed parser candidate ${candidate.displayName} from ${parseTask.sourceDocumentFilename}.${mappingLabel}${
          decision.note ? ` Note: ${decision.note}` : ""
        }`,
      };

      await insertTimelineEvent(client, input.patientId, reviewEvent, now);
      await updatePatientLastReviewed(client, input.patientId, now);

      const patient = await loadPatientRecord(client, input.patientId);
      if (!patient) {
        throw new Error(`Patient ${input.patientId} disappeared during review persistence.`);
      }

      return {
        patient,
        decision,
      };
    });
  },

  async promoteReviewDecision(input) {
    return withPostgresTransaction(async (client) => {
      await requirePatient(client, input.patientId, { forUpdate: true });

      const patientBefore = await loadPatientRecord(client, input.patientId);
      if (!patientBefore) {
        throw new Error(`Patient ${input.patientId} was not found.`);
      }

      const reviewDecision = await findReviewDecision(client, input.patientId, input.reviewDecisionId);
      if (!reviewDecision) {
        throw new Error(`Review decision ${input.reviewDecisionId} was not found.`);
      }

      if (reviewDecision.action !== "accept") {
        throw new Error(`Review decision ${input.reviewDecisionId} is not accepted and cannot be promoted.`);
      }

      if (
        !reviewDecision.proposedCanonicalCode ||
        !reviewDecision.proposedTitle ||
        !reviewDecision.proposedModality
      ) {
        throw new Error(`Review decision ${input.reviewDecisionId} does not include a proposed canonical mapping.`);
      }

      const existingPromotion = await findMeasurementPromotionByDecision(
        client,
        input.patientId,
        input.reviewDecisionId,
      );

      if (existingPromotion) {
        const existingMeasurement = patientBefore.measurements.find(
          (measurement) => measurement.id === existingPromotion.measurementId,
        );

        if (!existingMeasurement) {
          throw new Error(`Promotion ${existingPromotion.id} exists, but promoted measurement was not found.`);
        }

        return {
          patient: patientBefore,
          promotion: existingPromotion,
          measurement: existingMeasurement,
          alreadyPromoted: true,
        };
      }

      const parseTask = await findParseTask(client, input.patientId, reviewDecision.parseTaskId);
      if (!parseTask) {
        throw new Error(`Parse task ${reviewDecision.parseTaskId} was not found.`);
      }

      const candidate = parseTask.candidates.find((entry) => entry.id === reviewDecision.candidateId);
      if (!candidate) {
        throw new Error(`Candidate ${reviewDecision.candidateId} was not found for promotion.`);
      }

      if (candidate.numericValue === undefined) {
        throw new Error(`Candidate ${candidate.displayName} does not have a numeric value and cannot be promoted yet.`);
      }

      const sourceDocument = await findSourceDocument(client, reviewDecision.sourceDocumentId);
      const observedAt = candidate.observedAt ?? sourceDocument?.observedAt ?? reviewDecision.updatedAt;
      const now = new Date().toISOString();
      const measurementId = randomUUID();
      const promotedMeasurement: PatientRecord["measurements"][number] = {
        id: measurementId,
        title: reviewDecision.proposedTitle,
        canonicalCode: reviewDecision.proposedCanonicalCode,
        modality: reviewDecision.proposedModality,
        sourceVendor: sourceDocument
          ? `${sourceDocument.sourceSystem} reviewed parser candidate`
          : "Reviewed parser candidate",
        observedAt,
        value: candidate.numericValue,
        unit: candidate.unit,
        interpretation:
          "Clinician accepted parser candidate and promoted it into the longitudinal record. Preserve source provenance and compare against prior timepoints.",
        evidenceStatus: "stable",
        confidenceLabel: "moderate",
        deltaLabel: "Promoted from reviewed candidate",
      };

      const promotion: StoredMeasurementPromotion = {
        id: randomUUID(),
        patientId: input.patientId,
        reviewDecisionId: reviewDecision.id,
        parseTaskId: reviewDecision.parseTaskId,
        sourceDocumentId: reviewDecision.sourceDocumentId,
        canonicalCode: reviewDecision.proposedCanonicalCode,
        title: reviewDecision.proposedTitle,
        modality: reviewDecision.proposedModality,
        measurementId,
        promotedAt: now,
      };

      const promotionEvent: TimelineEvent = {
        id: randomUUID(),
        type: "assessment",
        occurredAt: now,
        title: `${reviewDecision.proposedTitle} promoted into canonical record`,
        detail: `${reviewDecision.candidateDisplayName} was promoted from clinician-reviewed parser output into ${reviewDecision.proposedCanonicalCode}.`,
      };

      await insertMeasurement(client, input.patientId, promotedMeasurement, now);
      await insertMeasurementPromotion(client, promotion);
      await insertTimelineEvent(client, input.patientId, promotionEvent, now);
      await updatePatientLastReviewed(client, input.patientId, now);

      const patient = await loadPatientRecord(client, input.patientId);
      if (!patient) {
        throw new Error(`Patient ${input.patientId} disappeared during promotion persistence.`);
      }

      return {
        patient,
        promotion,
        measurement: promotedMeasurement,
        alreadyPromoted: false,
      };
    });
  },
};
