import { MeasurementModality } from "@/src/lib/domain/types";
import { canonicalCatalog } from "@/src/lib/normalization/catalog";

type NormalizeEntry = {
  name: string;
  value: number;
  unit?: string;
};

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
  value: number;
  unit?: string;
  observedAt: string;
  confidence: "high" | "moderate";
  note: string;
};

export type UnmappedEntry = {
  sourceField: string;
  value: number;
  unit?: string;
};

export type NormalizedReportPayload = {
  patientId: string;
  observedAt: string;
  measurements: NormalizedMeasurement[];
  unmappedEntries: UnmappedEntry[];
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeReportPayload(input: NormalizeInput): NormalizedReportPayload {
  const measurements: NormalizedMeasurement[] = [];
  const unmappedEntries: UnmappedEntry[] = [];

  for (const entry of input.entries) {
    const normalizedName = normalizeKey(entry.name);
    const match = canonicalCatalog.find((item) =>
      item.aliases.some((alias) => normalizeKey(alias) === normalizedName),
    );

    if (!match) {
      unmappedEntries.push({
        sourceField: entry.name,
        value: entry.value,
        unit: entry.unit,
      });
      continue;
    }

    measurements.push({
      canonicalCode: match.canonicalCode,
      title: match.title,
      modality: match.modality,
      sourceVendor: input.vendor,
      sourceField: entry.name,
      value: entry.value,
      unit: entry.unit ?? match.preferredUnit,
      observedAt: input.observedAt,
      confidence: match.aliases[0] === normalizedName ? "high" : "moderate",
      note:
        match.modality === "epigenetic"
          ? "Preserve source report and vendor method details before clinician review."
          : "Suitable for timeline ingestion after unit and reference-range review.",
    });
  }

  return {
    patientId: input.patientId,
    observedAt: input.observedAt,
    measurements,
    unmappedEntries,
  };
}
