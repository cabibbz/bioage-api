import { randomUUID } from "node:crypto";
import { PatientRecord } from "@/src/lib/domain/types";
import { formatMeasurementValue, getMeasurementValueKind } from "@/src/lib/domain/measurements";
import { CanonicalDefinition } from "@/src/lib/normalization/catalog";
import { NormalizedMeasurement, UnmappedEntry } from "@/src/lib/normalization/normalize";
import { normalizeTextMeasurementValue } from "@/src/lib/normalization/text-values";
import { resolveMeasurementUnit } from "@/src/lib/normalization/units";
import {
  ParsedMeasurementCandidate,
  SourceDocumentClassification,
  SourceDocumentStatus,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";

type MeasurementInterpretationInput = Pick<
  PatientRecord["measurements"][number],
  "value" | "textValue" | "unit" | "modality"
>;
type MeasurementSummaryInput = MeasurementInterpretationInput & Pick<PatientRecord["measurements"][number], "title">;

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

export function summarizeMeasurement(measurement: MeasurementSummaryInput) {
  return `${measurement.title} ${formatMeasurementValue(measurement)}`;
}

export function buildInterpretation(measurement: MeasurementInterpretationInput) {
  if (measurement.value === undefined) {
    const renderedValue = formatMeasurementValue(measurement);
    if (measurement.modality === "genetic") {
      return `Genetic variant finding preserved as the reported categorical result ${renderedValue}. Keep the exact allele or mutation wording, source assay, and static non-trending nature explicit in clinician review.`;
    }

    if (getMeasurementValueKind(measurement) === "bounded") {
      return `Structured preventive-health measurement preserved as the reported bounded result ${renderedValue}. Keep the operator and source threshold context before comparing trends or intervention effects.`;
    }

    return `Structured preventive-health measurement preserved as the reported text or categorical result ${renderedValue}. Keep the original wording and provenance explicit before using it in longitudinal comparison.`;
  }

  if (measurement.modality === "epigenetic") {
    return "Epigenetic metric normalized from vendor report. Preserve source methodology and review against prior timepoints.";
  }

  if (measurement.modality === "wearable") {
    return "Wearable-derived signal normalized into the evidence layer. Compare with recent intervention windows before drawing conclusions.";
  }

  return "Structured preventive-health measurement normalized from the source report. Review trend and reference context before acting.";
}

export function buildPromotionInterpretation(measurement: MeasurementInterpretationInput) {
  if (measurement.value === undefined) {
    const renderedValue = formatMeasurementValue(measurement);
    if (measurement.modality === "genetic") {
      return `Clinician accepted parser candidate and promoted the categorical genetic finding ${renderedValue}. Keep the exact allele or mutation wording, source assay, and static non-trending nature explicit in clinician review.`;
    }

    if (getMeasurementValueKind(measurement) === "bounded") {
      return `Clinician accepted parser candidate and promoted the bounded result ${renderedValue}. Keep the operator, threshold context, and source provenance explicit before comparing trends or intervention effects.`;
    }

    return `Clinician accepted parser candidate and promoted the text or categorical result ${renderedValue}. Keep the original wording and source provenance explicit before using it in longitudinal comparison.`;
  }

  if (measurement.modality === "epigenetic") {
    return "Clinician accepted parser candidate and promoted an epigenetic metric into the longitudinal record. Preserve source methodology and compare against prior timepoints.";
  }

  if (measurement.modality === "wearable") {
    return "Clinician accepted parser candidate and promoted a wearable-derived signal into the evidence layer. Compare it with recent intervention windows before drawing conclusions.";
  }

  return "Clinician accepted parser candidate and promoted a normalized preventive-health measurement into the longitudinal record. Review trend, unit, and source context before acting.";
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

export function toPromotedMeasurementValue(
  candidate: ParsedMeasurementCandidate,
  definition: CanonicalDefinition,
) {
  if (candidate.numericValue !== undefined) {
    const normalizedValue = resolveMeasurementUnit(definition, candidate.numericValue, candidate.unit);
    return {
      value: normalizedValue.value,
      unit: normalizedValue.unit,
    } as const;
  }

  const textValue = candidate.textValue?.trim();
  if (textValue) {
    const normalizedText = normalizeTextMeasurementValue(definition, textValue);
    return {
      textValue: normalizedText.textValue,
      unit: candidate.unit,
    } as const;
  }

  throw new Error(`Candidate ${candidate.displayName} does not include a promotable value yet.`);
}
