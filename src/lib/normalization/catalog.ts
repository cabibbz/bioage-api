import canonicalCatalogJson from "@/src/lib/normalization/canonical-catalog.json";
import { MeasurementModality } from "@/src/lib/domain/types";

export type CanonicalDefinition = {
  canonicalCode: string;
  title: string;
  modality: MeasurementModality;
  preferredUnit?: string;
  aliases: string[];
};

export const canonicalCatalog = canonicalCatalogJson as CanonicalDefinition[];
