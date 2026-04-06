import { randomUUID } from "node:crypto";
import { PatientRecord } from "@/src/lib/domain/types";
import { NormalizedMeasurement, UnmappedEntry } from "@/src/lib/normalization/normalize";
import {
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
  const unitSuffix = measurement.unit ? ` ${measurement.unit}` : "";
  return `${measurement.title} ${measurement.value}${unitSuffix}`;
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
    value: measurement.value,
    unit: measurement.unit,
    interpretation: buildInterpretation(measurement),
    evidenceStatus: toEvidenceStatus(measurement, unmappedEntries),
    confidenceLabel: measurement.confidence === "high" ? "high" : "moderate",
    deltaLabel: "New baseline",
  };
}
