import { randomUUID } from "node:crypto";
import { PatientRecord } from "@/src/lib/domain/types";
import { formatMeasurementValue } from "@/src/lib/domain/measurements";
import { NormalizedMeasurement, UnmappedEntry } from "@/src/lib/normalization/normalize";
import {
  ParsedMeasurementCandidate,
  SourceDocumentClassification,
  SourceDocumentStatus,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";

export function buildDocumentStatus(classification: SourceDocumentClassification): SourceDocumentStatus {
  if (classification === "zip_archive") {
    return "archive_indexed";
  }

  if (classification === "unknown") {
    return "needs_review";
  }

  return "pending_parse";
}

export function summarizeSourceDocument(document: StoredSourceDocument) {
  if (document.classification === "zip_archive") {
    return `${document.originalFilename} indexed as ZIP archive with ${document.archiveEntries?.length ?? 0} entries.`;
  }

  return `${document.originalFilename} stored as ${document.classification}.`;
}

export function summarizeArchiveExtraction(
  archiveDocument: StoredSourceDocument,
  extractedChildDocuments: StoredSourceDocument[],
) {
  return `${archiveDocument.originalFilename} stored as ZIP archive with ${
    archiveDocument.archiveEntries?.length ?? 0
  } entries; extracted ${extractedChildDocuments.length} supported child documents.`;
}

export function summarizeMeasurement(measurement: NormalizedMeasurement) {
  return `${measurement.title} ${formatMeasurementValue(measurement)}`;
}

export function buildInterpretation(measurement: NormalizedMeasurement) {
  if (measurement.modality === "epigenetic") {
    return "Epigenetic metric normalized from vendor report. Preserve source methodology and review against prior timepoints.";
  }

  if (measurement.modality === "wearable") {
    return "Wearable-derived signal normalized into the evidence layer. Compare with recent intervention windows before drawing conclusions.";
  }

  return "Structured preventive-health measurement normalized from the source report. Review trend and reference context before acting.";
}

export function toEvidenceStatus(
  measurement: NormalizedMeasurement,
  unmappedEntries: UnmappedEntry[],
): PatientRecord["measurements"][number]["evidenceStatus"] {
  if (measurement.modality === "wearable") {
    return "watch";
  }

  if (unmappedEntries.length > 0 && measurement.modality === "epigenetic") {
    return "conflicted";
  }

  return "stable";
}

export function toPatientMeasurement(
  measurement: NormalizedMeasurement,
  unmappedEntries: UnmappedEntry[],
): PatientRecord["measurements"][number] {
  return {
    id: randomUUID(),
    title: measurement.title,
    canonicalCode: measurement.canonicalCode,
    modality: measurement.modality,
    sourceVendor: measurement.sourceVendor,
    observedAt: measurement.observedAt,
    ...(measurement.value !== undefined
      ? { value: measurement.value }
      : { textValue: measurement.textValue }),
    unit: measurement.unit,
    interpretation: buildInterpretation(measurement),
    evidenceStatus: toEvidenceStatus(measurement, unmappedEntries),
    confidenceLabel: measurement.confidence === "high" ? "high" : "moderate",
    deltaLabel: "New baseline",
  };
}

export function candidateHasPromotableValue(candidate: ParsedMeasurementCandidate) {
  return candidate.numericValue !== undefined || Boolean(candidate.textValue?.trim());
}

export function toPromotedMeasurementValue(candidate: ParsedMeasurementCandidate) {
  if (candidate.numericValue !== undefined) {
    return {
      value: candidate.numericValue,
      unit: candidate.unit,
    } as const;
  }

  const textValue = candidate.textValue?.trim();
  if (textValue) {
    return {
      textValue,
      unit: candidate.unit,
    } as const;
  }

  throw new Error(`Candidate ${candidate.displayName} does not include a promotable value yet.`);
}
