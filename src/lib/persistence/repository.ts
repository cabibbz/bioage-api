import { PatientRecord } from "@/src/lib/domain/types";
import {
  StoredMeasurementPromotion,
  StoredParseTask,
  StoredReportIngestion,
  StoredReviewDecision,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";

export type PersistNormalizedReportInput = {
  patientId: string;
  vendor: string;
  observedAt: string;
  measurements: import("@/src/lib/normalization/normalize").NormalizedMeasurement[];
  unmappedEntries: import("@/src/lib/normalization/normalize").UnmappedEntry[];
};

export type PersistSourceDocumentUploadInput = {
  patientId: string;
  sourceSystem: string;
  originalFilename: string;
  mimeType: string;
  bytes: Buffer;
  observedAt?: string;
};

export type EvidenceRepository = {
  getPatientRecord(patientId: string): Promise<PatientRecord | null>;
  listReportIngestions(patientId: string): Promise<StoredReportIngestion[]>;
  listSourceDocuments(patientId: string): Promise<StoredSourceDocument[]>;
  listParseTasks(patientId: string): Promise<StoredParseTask[]>;
  listReviewDecisions(patientId: string): Promise<StoredReviewDecision[]>;
  listMeasurementPromotions(patientId: string): Promise<StoredMeasurementPromotion[]>;
  persistNormalizedReport(payload: PersistNormalizedReportInput): Promise<{
    patient: PatientRecord;
    ingestion: StoredReportIngestion;
  }>;
  addInterventionEvent(input: {
    patientId: string;
    title: string;
    detail: string;
    occurredAt: string;
  }): Promise<PatientRecord>;
  persistSourceDocumentUpload(input: PersistSourceDocumentUploadInput): Promise<{
    patient: PatientRecord;
    document: StoredSourceDocument;
    extractedChildDocuments: StoredSourceDocument[];
    parseTasks: StoredParseTask[];
  }>;
  persistReviewDecision(input: {
    patientId: string;
    parseTaskId: string;
    candidateId: string;
    action: StoredReviewDecision["action"];
    reviewerName: string;
    note?: string;
    proposedCanonicalCode?: string;
  }): Promise<{
    patient: PatientRecord;
    decision: StoredReviewDecision;
  }>;
  promoteReviewDecision(input: {
    patientId: string;
    reviewDecisionId: string;
  }): Promise<{
    patient: PatientRecord;
    promotion: StoredMeasurementPromotion;
    measurement: PatientRecord["measurements"][number];
    alreadyPromoted: boolean;
  }>;
};
