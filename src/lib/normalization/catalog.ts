import canonicalCatalogJson from "@/src/lib/normalization/canonical-catalog.json";
import { MeasurementModality } from "@/src/lib/domain/types";

export type BiomarkerCategory =
  | "biological_age"
  | "organ_age"
  | "fitness"
  | "immune_composition"
  | "lipid"
  | "metabolic"
  | "inflammatory"
  | "hormone"
  | "thyroid"
  | "nutrient"
  | "liver"
  | "kidney"
  | "hematology"
  | "wearable_recovery"
  | "wearable_sleep"
  | "wearable_activity"
  | "cgm"
  | "body_composition"
  | "cardiovascular_imaging"
  | "cardiovascular_advanced"
  | "gut_health"
  | "oxidative_stress"
  | "genetic_variant";

export type CanonicalRange = {
  low?: number;
  high?: number;
  sex?: "M" | "F";
  text?: string;
};

export type CanonicalDefinition = {
  canonicalCode: string;
  title: string;
  modality: MeasurementModality;
  category: BiomarkerCategory;
  preferredUnit: string;
  alternateUnits?: string[];
  loincCode?: string;
  aliases: string[];
  refRange?: CanonicalRange;
  longevityOptimal?: CanonicalRange;
  notes?: string;
};

export function normalizeCatalogKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getLookupKeys(item: CanonicalDefinition) {
  return [item.canonicalCode, item.title, ...item.aliases]
    .map(normalizeCatalogKey)
    .filter(Boolean);
}

function validateCatalog(input: unknown): CanonicalDefinition[] {
  if (!Array.isArray(input)) {
    throw new Error("Canonical catalog must be an array.");
  }

  const seenCodes = new Set<string>();
  const seenLookupKeys = new Map<string, string>();
  const catalog = input as CanonicalDefinition[];

  for (const item of catalog) {
    if (
      !item ||
      typeof item.canonicalCode !== "string" ||
      typeof item.title !== "string" ||
      typeof item.modality !== "string" ||
      typeof item.category !== "string" ||
      typeof item.preferredUnit !== "string" ||
      !Array.isArray(item.aliases)
    ) {
      throw new Error("Canonical catalog entries must include code, title, modality, category, unit, and aliases.");
    }

    if (item.aliases.length === 0) {
      throw new Error(`Canonical catalog entry ${item.canonicalCode} must include at least one alias.`);
    }

    if (seenCodes.has(item.canonicalCode)) {
      throw new Error(`Canonical catalog entry ${item.canonicalCode} is duplicated.`);
    }

    seenCodes.add(item.canonicalCode);

    for (const lookupKey of getLookupKeys(item)) {
      const existingCode = seenLookupKeys.get(lookupKey);
      if (existingCode && existingCode !== item.canonicalCode) {
        throw new Error(
          `Canonical lookup key "${lookupKey}" is ambiguous between ${existingCode} and ${item.canonicalCode}.`,
        );
      }

      seenLookupKeys.set(lookupKey, item.canonicalCode);
    }
  }

  return catalog;
}

export const canonicalCatalog = validateCatalog(canonicalCatalogJson);

const catalogByLookupKey = new Map(
  canonicalCatalog.flatMap((item) => getLookupKeys(item).map((lookupKey) => [lookupKey, item] as const)),
);

const catalogByLoincCode = new Map(
  canonicalCatalog
    .filter((item) => item.loincCode)
    .map((item) => [item.loincCode as string, item] as const),
);

export function findCanonicalDefinitionByName(value: string) {
  return catalogByLookupKey.get(normalizeCatalogKey(value));
}

export function findCanonicalDefinitionByLoincCode(value: string) {
  return catalogByLoincCode.get(value.trim());
}
