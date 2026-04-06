import { CanonicalDefinition } from "@/src/lib/normalization/catalog";

export type TextNormalizationResult = {
  textValue: string;
  note?: string;
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildCanonicalizationNote(title: string, sourceValue: string, normalizedValue: string) {
  if (normalizeWhitespace(sourceValue).toLowerCase() === normalizedValue.toLowerCase()) {
    return undefined;
  }

  return `Normalized reported ${title} notation from "${normalizeWhitespace(sourceValue)}" to "${normalizedValue}".`;
}

function normalizeApoeGenotype(sourceValue: string): TextNormalizationResult {
  const normalizedInput = normalizeWhitespace(sourceValue)
    .toLowerCase()
    .replace(/[\u03b5\u0395]/g, "e");
  const alleleMatches = [...normalizedInput.matchAll(/\b(?:e)?([234])\b/g)].map((match) => Number(match[1]));

  if (alleleMatches.length !== 2) {
    return {
      textValue: normalizeWhitespace(sourceValue),
    };
  }

  const sortedAlleles = alleleMatches.sort((left, right) => left - right);
  const normalizedValue = `e${sortedAlleles[0]}/e${sortedAlleles[1]}`;

  return {
    textValue: normalizedValue,
    note: buildCanonicalizationNote("ApoE genotype", sourceValue, normalizedValue),
  };
}

function normalizeMthfrStatus(sourceValue: string): TextNormalizationResult {
  const normalizedInput = normalizeWhitespace(sourceValue).toLowerCase();
  const hasC677T = normalizedInput.includes("c677t");
  const hasA1298C = normalizedInput.includes("a1298c");
  const hasHomozygous = normalizedInput.includes("homozygous");
  const hasHeterozygous = normalizedInput.includes("heterozygous") || /\bhet\b/.test(normalizedInput);
  const hasCompoundCue = /(compound|comp(?:ound)?|double)\s+(heterozygous|het)/.test(normalizedInput);

  let normalizedValue: string | undefined;

  if (hasC677T && hasA1298C && !hasHomozygous && (hasCompoundCue || hasHeterozygous)) {
    normalizedValue = "compound heterozygous C677T/A1298C";
  } else if (hasC677T && hasHomozygous) {
    normalizedValue = "C677T homozygous";
  } else if (hasC677T && hasHeterozygous) {
    normalizedValue = "C677T heterozygous";
  } else if (hasA1298C && hasHomozygous) {
    normalizedValue = "A1298C homozygous";
  } else if (hasA1298C && hasHeterozygous) {
    normalizedValue = "A1298C heterozygous";
  }

  if (!normalizedValue) {
    return {
      textValue: normalizeWhitespace(sourceValue),
    };
  }

  return {
    textValue: normalizedValue,
    note: buildCanonicalizationNote("MTHFR status", sourceValue, normalizedValue),
  };
}

export function normalizeTextMeasurementValue(
  definition: CanonicalDefinition,
  sourceValue: string,
): TextNormalizationResult {
  if (definition.canonicalCode === "apoe_genotype") {
    return normalizeApoeGenotype(sourceValue);
  }

  if (definition.canonicalCode === "mthfr_status") {
    return normalizeMthfrStatus(sourceValue);
  }

  return {
    textValue: normalizeWhitespace(sourceValue),
  };
}
