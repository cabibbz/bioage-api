import { MeasurementModality, PatientRecord } from "@/src/lib/domain/types";
import { NormalizedMeasurement, UnmappedEntry } from "@/src/lib/normalization/normalize";

export type StoredReportIngestion = {
  id: string;
  patientId: string;
  vendor: string;
  observedAt: string;
  receivedAt: string;
  mappedMeasurements: NormalizedMeasurement[];
  unmappedEntries: UnmappedEntry[];
};

export type SourceDocumentClassification =
  | "zip_archive"
  | "pdf_report"
  | "image_report"
  | "json_payload"
  | "fhir_bundle"
  | "fhir_resource"
  | "ccda_xml"
  | "html_export"
  | "spreadsheet"
  | "text_note"
  | "unknown";

export type SourceDocumentStatus =
  | "stored"
  | "archive_indexed"
  | "pending_parse"
  | "parsed_summary_ready"
  | "needs_review"
  | "parse_failed";

export type StoredArchiveEntry = {
  path: string;
  isDirectory: boolean;
  classification: SourceDocumentClassification;
};

export type StoredSourceDocument = {
  id: string;
  patientId: string;
  sourceSystem: string;
  ingestionChannel: "manual_upload" | "archive_extract";
  originalFilename: string;
  storedFilename: string;
  storageBackend: "local_fs" | "object_storage";
  storageKey: string;
  relativePath: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  classification: SourceDocumentClassification;
  status: SourceDocumentStatus;
  receivedAt: string;
  observedAt?: string;
  parentDocumentId?: string;
  archiveEntryPath?: string;
  archiveEntries?: StoredArchiveEntry[];
};

export type ParseTaskMode = "deterministic" | "review";

export type ParseTaskStatus = "queued" | "completed" | "needs_review" | "failed";

export type ParseTaskParser =
  | "archive_manifest"
  | "fhir_bundle"
  | "fhir_resource"
  | "generic_json"
  | "csv_table"
  | "text_note"
  | "ccda_metadata"
  | "pdf_review"
  | "image_review"
  | "html_review"
  | "spreadsheet_review"
  | "unknown_review";

export type ParseTaskMetadataItem = {
  label: string;
  value: string;
};

export type ParsedMeasurementCandidate = {
  id: string;
  sourcePath: string;
  displayName: string;
  valueLabel: string;
  numericValue?: number;
  textValue?: string;
  unit?: string;
  loincCode?: string;
  observedAt?: string;
  referenceRange?: string;
};

export type StoredParseTask = {
  id: string;
  patientId: string;
  sourceDocumentId: string;
  sourceDocumentFilename: string;
  sourceDocumentClassification: SourceDocumentClassification;
  mode: ParseTaskMode;
  parser: ParseTaskParser;
  status: ParseTaskStatus;
  summary: string;
  detail: string;
  candidateCount: number;
  metadata: ParseTaskMetadataItem[];
  candidates: ParsedMeasurementCandidate[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

export type ReviewDecisionAction = "accept" | "reject" | "follow_up";

export type StoredReviewDecision = {
  id: string;
  patientId: string;
  parseTaskId: string;
  sourceDocumentId: string;
  candidateId: string;
  candidateDisplayName: string;
  candidateValueLabel: string;
  candidateSourcePath: string;
  action: ReviewDecisionAction;
  reviewerName: string;
  note?: string;
  proposedCanonicalCode?: string;
  proposedTitle?: string;
  proposedModality?: MeasurementModality;
  createdAt: string;
  updatedAt: string;
};

export type StoredMeasurementPromotion = {
  id: string;
  patientId: string;
  reviewDecisionId: string;
  parseTaskId: string;
  sourceDocumentId: string;
  canonicalCode: string;
  title: string;
  modality: MeasurementModality;
  measurementId: string;
  promotedAt: string;
};

export type StoreFile = {
  patients: PatientRecord[];
  reportIngestions: StoredReportIngestion[];
  sourceDocuments: StoredSourceDocument[];
  parseTasks: StoredParseTask[];
  reviewDecisions: StoredReviewDecision[];
  measurementPromotions: StoredMeasurementPromotion[];
};
