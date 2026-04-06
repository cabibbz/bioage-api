import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import {
  classifyArchiveEntry,
  classifySourceDocument,
  inferMimeTypeFromFilename,
} from "@/src/lib/ingestion/classify";
import { runParseTask, toSourceDocumentStatus } from "@/src/lib/parsing/task-runner";
import { PatientRecord, TimelineEvent } from "@/src/lib/domain/types";
import {
  buildDocumentStatus,
  buildInterpretation,
  summarizeArchiveExtraction,
  summarizeMeasurement,
  summarizeSourceDocument,
  toEvidenceStatus,
  toPatientMeasurement,
} from "@/src/lib/persistence/evidence-logic";
import {
  NormalizedMeasurement,
  NormalizedReportPayload,
  UnmappedEntry,
} from "@/src/lib/normalization/normalize";
import {
  SourceDocumentClassification,
  SourceDocumentStatus,
  StoreFile,
  StoredMeasurementPromotion,
  StoredParseTask,
  StoredReportIngestion,
  StoredReviewDecision,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";
import { canonicalCatalog } from "@/src/lib/normalization/catalog";
import { getBinaryStorageRepository } from "@/src/lib/storage";

const storePath = path.join(process.cwd(), "data", "store.json");

function normalizeStoreFile(store: Partial<StoreFile>): StoreFile {
  return {
    patients: store.patients ?? [],
    reportIngestions: store.reportIngestions ?? [],
    sourceDocuments: store.sourceDocuments ?? [],
    parseTasks: store.parseTasks ?? [],
    reviewDecisions: store.reviewDecisions ?? [],
    measurementPromotions: store.measurementPromotions ?? [],
  };
}

async function readStore(): Promise<StoreFile> {
  const raw = await fs.readFile(storePath, "utf8");
  return normalizeStoreFile(JSON.parse(raw) as Partial<StoreFile>);
}

async function writeStore(store: StoreFile) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function getPatientRecord(patientId: string): Promise<PatientRecord | null> {
  const store = await readStore();
  return store.patients.find((patient) => patient.id === patientId) ?? null;
}

export async function listReportIngestions(patientId: string): Promise<StoredReportIngestion[]> {
  const store = await readStore();
  return store.reportIngestions.filter((ingestion) => ingestion.patientId === patientId);
}

export async function listSourceDocuments(patientId: string): Promise<StoredSourceDocument[]> {
  const store = await readStore();
  return store.sourceDocuments
    .filter((document) => document.patientId === patientId)
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}

export async function listParseTasks(patientId: string): Promise<StoredParseTask[]> {
  const store = await readStore();
  return store.parseTasks
    .filter((task) => task.patientId === patientId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listReviewDecisions(patientId: string): Promise<StoredReviewDecision[]> {
  const store = await readStore();
  return store.reviewDecisions
    .filter((decision) => decision.patientId === patientId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listMeasurementPromotions(patientId: string): Promise<StoredMeasurementPromotion[]> {
  const store = await readStore();
  return store.measurementPromotions
    .filter((promotion) => promotion.patientId === patientId)
    .sort((left, right) => right.promotedAt.localeCompare(left.promotedAt));
}

export async function persistNormalizedReport(
  payload: NormalizedReportPayload & { vendor: string },
): Promise<{ patient: PatientRecord; ingestion: StoredReportIngestion }> {
  const store = await readStore();
  const patientIndex = store.patients.findIndex((patient) => patient.id === payload.patientId);

  if (patientIndex === -1) {
    throw new Error(`Patient ${payload.patientId} was not found.`);
  }

  const patient = store.patients[patientIndex];
  const measurements = payload.measurements.map((measurement) =>
    toPatientMeasurement(measurement, payload.unmappedEntries),
  );

  const ingestion: StoredReportIngestion = {
    id: randomUUID(),
    patientId: payload.patientId,
    vendor: payload.vendor,
    observedAt: payload.observedAt,
    receivedAt: new Date().toISOString(),
    mappedMeasurements: payload.measurements,
    unmappedEntries: payload.unmappedEntries,
  };

  const measurementSummary = payload.measurements.length
    ? payload.measurements.map(summarizeMeasurement).join("; ")
    : "No canonical metrics were mapped";

  const newTimelineEvent: TimelineEvent = {
    id: randomUUID(),
    type: "assessment",
    occurredAt: payload.observedAt,
    title: `${payload.vendor} report normalized`,
    detail:
      payload.unmappedEntries.length > 0
        ? `${measurementSummary}. ${payload.unmappedEntries.length} source fields still require mapping review.`
        : measurementSummary,
  };

  const updatedPatient: PatientRecord = {
    ...patient,
    lastReviewedAt: ingestion.receivedAt,
    measurements: [...measurements, ...patient.measurements].sort((left, right) =>
      right.observedAt.localeCompare(left.observedAt),
    ),
    timeline: [newTimelineEvent, ...patient.timeline].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    ),
  };

  store.patients[patientIndex] = updatedPatient;
  store.reportIngestions = [ingestion, ...store.reportIngestions];

  await writeStore(store);

  return {
    patient: updatedPatient,
    ingestion,
  };
}

export async function addInterventionEvent(input: {
  patientId: string;
  title: string;
  detail: string;
  occurredAt: string;
}): Promise<PatientRecord> {
  const store = await readStore();
  const patientIndex = store.patients.findIndex((patient) => patient.id === input.patientId);

  if (patientIndex === -1) {
    throw new Error(`Patient ${input.patientId} was not found.`);
  }

  const patient = store.patients[patientIndex];
  const interventionEvent: TimelineEvent = {
    id: randomUUID(),
    type: "intervention",
    occurredAt: input.occurredAt,
    title: input.title,
    detail: input.detail,
  };

  const updatedPatient: PatientRecord = {
    ...patient,
    lastReviewedAt: new Date().toISOString(),
    timeline: [interventionEvent, ...patient.timeline].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    ),
  };

  store.patients[patientIndex] = updatedPatient;
  await writeStore(store);

  return updatedPatient;
}

export async function persistReviewDecision(input: {
  patientId: string;
  parseTaskId: string;
  candidateId: string;
  action: StoredReviewDecision["action"];
  reviewerName: string;
  note?: string;
  proposedCanonicalCode?: string;
}): Promise<{ patient: PatientRecord; decision: StoredReviewDecision }> {
  const store = await readStore();
  const patientIndex = store.patients.findIndex((patient) => patient.id === input.patientId);

  if (patientIndex === -1) {
    throw new Error(`Patient ${input.patientId} was not found.`);
  }

  const patient = store.patients[patientIndex];
  const parseTask = store.parseTasks.find(
    (task) => task.id === input.parseTaskId && task.patientId === input.patientId,
  );

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

  const now = new Date().toISOString();
  const existingDecisionIndex = store.reviewDecisions.findIndex(
    (decision) =>
      decision.patientId === input.patientId &&
      decision.parseTaskId === input.parseTaskId &&
      decision.candidateId === input.candidateId,
  );

  const decision: StoredReviewDecision = {
    id: existingDecisionIndex >= 0 ? store.reviewDecisions[existingDecisionIndex].id : randomUUID(),
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
    createdAt: existingDecisionIndex >= 0 ? store.reviewDecisions[existingDecisionIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingDecisionIndex >= 0) {
    store.reviewDecisions[existingDecisionIndex] = decision;
  } else {
    store.reviewDecisions = [decision, ...store.reviewDecisions];
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

  const updatedPatient: PatientRecord = {
    ...patient,
    lastReviewedAt: now,
    timeline: [reviewEvent, ...patient.timeline].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    ),
  };

  store.patients[patientIndex] = updatedPatient;
  await writeStore(store);

  return {
    patient: updatedPatient,
    decision,
  };
}

export async function promoteReviewDecision(input: {
  patientId: string;
  reviewDecisionId: string;
}): Promise<{
  patient: PatientRecord;
  promotion: StoredMeasurementPromotion;
  measurement: PatientRecord["measurements"][number];
  alreadyPromoted: boolean;
}> {
  const store = await readStore();
  const patientIndex = store.patients.findIndex((patient) => patient.id === input.patientId);

  if (patientIndex === -1) {
    throw new Error(`Patient ${input.patientId} was not found.`);
  }

  const patient = store.patients[patientIndex];
  const reviewDecision = store.reviewDecisions.find(
    (decision) => decision.id === input.reviewDecisionId && decision.patientId === input.patientId,
  );

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

  const existingPromotion = store.measurementPromotions.find(
    (promotion) =>
      promotion.reviewDecisionId === input.reviewDecisionId && promotion.patientId === input.patientId,
  );

  if (existingPromotion) {
    const existingMeasurement = patient.measurements.find(
      (measurement) => measurement.id === existingPromotion.measurementId,
    );

    if (!existingMeasurement) {
      throw new Error(`Promotion ${existingPromotion.id} exists, but promoted measurement was not found.`);
    }

    return {
      patient,
      promotion: existingPromotion,
      measurement: existingMeasurement,
      alreadyPromoted: true,
    };
  }

  const parseTask = store.parseTasks.find(
    (task) => task.id === reviewDecision.parseTaskId && task.patientId === input.patientId,
  );

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

  const sourceDocument = store.sourceDocuments.find((document) => document.id === reviewDecision.sourceDocumentId);
  const observedAt = candidate.observedAt ?? sourceDocument?.observedAt ?? reviewDecision.updatedAt;
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

  const now = new Date().toISOString();
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

  const updatedPatient: PatientRecord = {
    ...patient,
    lastReviewedAt: now,
    measurements: [...patient.measurements, promotedMeasurement].sort((left, right) =>
      right.observedAt.localeCompare(left.observedAt),
    ),
    timeline: [promotionEvent, ...patient.timeline].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    ),
  };

  store.patients[patientIndex] = updatedPatient;
  store.measurementPromotions = [promotion, ...store.measurementPromotions];
  await writeStore(store);

  return {
    patient: updatedPatient,
    promotion,
    measurement: promotedMeasurement,
    alreadyPromoted: false,
  };
}

export async function persistSourceDocumentUpload(input: {
  patientId: string;
  sourceSystem: string;
  originalFilename: string;
  mimeType: string;
  bytes: Buffer;
  observedAt?: string;
}): Promise<{
  patient: PatientRecord;
  document: StoredSourceDocument;
  extractedChildDocuments: StoredSourceDocument[];
  parseTasks: StoredParseTask[];
}> {
  const store = await readStore();
  const binaryStorage = getBinaryStorageRepository();
  await binaryStorage.ensureReady();
  const patientIndex = store.patients.findIndex((patient) => patient.id === input.patientId);

  if (patientIndex === -1) {
    throw new Error(`Patient ${input.patientId} was not found.`);
  }

  const patient = store.patients[patientIndex];
  const documentId = randomUUID();
  const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
  const classification = classifySourceDocument({
    filename: input.originalFilename,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });

  let archiveEntries: StoredSourceDocument["archiveEntries"];
  let extractedChildDocuments: StoredSourceDocument[] = [];
  const parseInputs: Array<{
    document: StoredSourceDocument;
    bytes?: Buffer;
  }> = [];

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
        const childBytes = await zipEntry.async("nodebuffer");
        const childId = randomUUID();
        const childMimeType = inferMimeTypeFromFilename(entry.path);
        const storedBinary = await binaryStorage.writeBinary({
          filenameHint: entry.path,
          bytes: childBytes,
        });

        const document = {
          id: childId,
          patientId: input.patientId,
          sourceSystem: input.sourceSystem,
          ingestionChannel: "archive_extract",
          originalFilename: path.basename(entry.path),
          storedFilename: storedBinary.storedFilename,
          storageBackend: storedBinary.backend,
          storageKey: storedBinary.storageKey,
          relativePath: storedBinary.relativePath,
          mimeType: childMimeType,
          byteSize: childBytes.length,
          checksumSha256: createHash("sha256").update(childBytes).digest("hex"),
          classification: entry.classification,
          status: buildDocumentStatus(entry.classification),
          receivedAt: new Date().toISOString(),
          observedAt: input.observedAt,
          parentDocumentId: documentId,
          archiveEntryPath: entry.path,
        } satisfies StoredSourceDocument;

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
    receivedAt: new Date().toISOString(),
    observedAt: input.observedAt,
    archiveEntries,
  };

  parseInputs.unshift({
    document,
    bytes: input.bytes,
  });

  const parseTasks = parseInputs.map((parseInput) => runParseTask(parseInput));
  const parseTasksByDocumentId = new Map(parseTasks.map((task) => [task.sourceDocumentId, task]));
  const parsedDocument = {
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

  const updatedPatient: PatientRecord = {
    ...patient,
    lastReviewedAt: parsedDocument.receivedAt,
    timeline: [timelineEvent, ...patient.timeline].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    ),
  };

  store.patients[patientIndex] = updatedPatient;
  store.sourceDocuments = [parsedDocument, ...parsedChildDocuments, ...store.sourceDocuments];
  store.parseTasks = [...parseTasks, ...store.parseTasks];

  await writeStore(store);

  return {
    patient: updatedPatient,
    document: parsedDocument,
    extractedChildDocuments: parsedChildDocuments,
    parseTasks,
  };
}
