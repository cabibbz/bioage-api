import { CanonicalMeasurementValue, MeasurementModality } from "@/src/lib/domain/types";
import { findCanonicalDefinitionByName, normalizeCatalogKey } from "@/src/lib/normalization/catalog";
import { resolveMeasurementUnit } from "@/src/lib/normalization/units";

type NormalizeEntry = {
  name: string;
  unit?: string;
} & CanonicalMeasurementValue;

type NormalizeInput = {
  patientId: string;
  vendor: string;
  observedAt: string;
  entries: NormalizeEntry[];
};

export type NormalizedMeasurement = {
  canonicalCode: string;
  title: string;
  modality: MeasurementModality;
  sourceVendor: string;
  sourceField: string;
  unit?: string;
  observedAt: string;
  confidence: "high" | "moderate";
  note: string;
} & CanonicalMeasurementValue;

export type UnmappedEntry = {
  sourceField: string;
  unit?: string;
} & CanonicalMeasurementValue;

export type NormalizedReportPayload = {
  patientId: string;
  observedAt: string;
  measurements: NormalizedMeasurement[];
  unmappedEntries: UnmappedEntry[];
};

export function normalizeReportPayload(input: NormalizeInput): NormalizedReportPayload {
  const measurements: NormalizedMeasurement[] = [];
  const unmappedEntries: UnmappedEntry[] = [];

  for (const entry of input.entries) {
    const normalizedName = normalizeCatalogKey(entry.name);
    const match = findCanonicalDefinitionByName(entry.name);

    if (!match) {
      unmappedEntries.push({
        sourceField: entry.name,
        ...(entry.value !== undefined ? { value: entry.value } : { textValue: entry.textValue }),
        unit: entry.unit,
      });
      continue;
    }

    if (entry.value !== undefined) {
      const normalizedValue = resolveMeasurementUnit(match, entry.value, entry.unit);

      measurements.push({
        canonicalCode: match.canonicalCode,
        title: match.title,
        modality: match.modality,
        sourceVendor: input.vendor,
        sourceField: entry.name,
        value: normalizedValue.value,
        unit: normalizedValue.unit,
        observedAt: input.observedAt,
        confidence: normalizeCatalogKey(match.aliases[0]) === normalizedName ? "high" : "moderate",
        note: [
          match.modality === "epigenetic"
            ? "Preserve source report and vendor method details before clinician review."
            : "Suitable for timeline ingestion after unit and reference-range review.",
          normalizedValue.note,
          match.notes,
        ]
          .filter(Boolean)
          .join(" "),
      });
      continue;
    }

    measurements.push({
      canonicalCode: match.canonicalCode,
      title: match.title,
      modality: match.modality,
      sourceVendor: input.vendor,
      sourceField: entry.name,
      textValue: entry.textValue,
      unit: entry.unit,
      observedAt: input.observedAt,
      confidence: normalizeCatalogKey(match.aliases[0]) === normalizedName ? "high" : "moderate",
      note: [
        match.modality === "epigenetic"
          ? "Preserve source report and vendor method details before clinician review."
          : "Suitable for timeline ingestion after unit and reference-range review.",
        "Preserved reported text/bounded result without numeric conversion.",
        match.notes,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return {
    patientId: input.patientId,
    observedAt: input.observedAt,
    measurements,
    unmappedEntries,
  };
}
