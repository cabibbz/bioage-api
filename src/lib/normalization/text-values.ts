import { CanonicalDefinition } from "@/src/lib/normalization/catalog";

export type TextNormalizationResult = {
  textValue: string;
  note?: string;
};

const apoeRsGenotypeMap = new Map<string, string>([
  ["tt:cc", "e3/e3"],
  ["tt:ct", "e2/e3"],
  ["tt:tt", "e2/e2"],
  ["ct:cc", "e3/e4"],
  ["ct:ct", "e2/e4"],
  ["cc:cc", "e4/e4"],
]);

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildCanonicalizationNote(title: string, sourceValue: string, normalizedValue: string) {
  if (normalizeWhitespace(sourceValue).toLowerCase() === normalizedValue.toLowerCase()) {
    return undefined;
  }

  return `Normalized reported ${title} notation from "${normalizeWhitespace(sourceValue)}" to "${normalizedValue}".`;
}

function normalizeApoeAllelePair(input: string) {
  const alleleMatches = [...input.matchAll(/\b(?:e)?([234])\b/g)].map((match) => Number(match[1]));
  if (alleleMatches.length !== 2) {
    return undefined;
  }

  const sortedAlleles = alleleMatches.sort((left, right) => left - right);
  return `e${sortedAlleles[0]}/e${sortedAlleles[1]}`;
}

function normalizeSnpGenotypePair(left: string, right: string) {
  return [left, right].sort().join("");
}

function extractSnpGenotype(input: string, snpId: string) {
  const patterns = [
    new RegExp(`${snpId}(?:\\s*[:=]\\s*|\\s+genotype\\s+|\\s+)([ct])\\s*(?:[/|,]|\\s+)?\\s*([ct])\\b`),
    new RegExp(`${snpId}[^\\n;,]{0,24}?\\b([ct])\\s*(?:[/|,]|\\s+)?\\s*([ct])\\b`),
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return normalizeSnpGenotypePair(match[1], match[2]);
    }
  }

  return undefined;
}

function normalizeApoeRsGenotype(input: string) {
  const rs429358 = extractSnpGenotype(input, "rs429358");
  const rs7412 = extractSnpGenotype(input, "rs7412");

  if (!rs429358 || !rs7412) {
    return undefined;
  }

  return apoeRsGenotypeMap.get(`${rs429358}:${rs7412}`);
}

function normalizeApoeGenotype(sourceValue: string): TextNormalizationResult {
  const normalizedInput = normalizeWhitespace(sourceValue)
    .toLowerCase()
    .replace(/[\u03b5\u0395]/g, "e");
  const normalizedValue = normalizeApoeAllelePair(normalizedInput) ?? normalizeApoeRsGenotype(normalizedInput);

  if (!normalizedValue) {
    return {
      textValue: normalizeWhitespace(sourceValue),
    };
  }

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
  const hasOneCopyCue = /\b(?:one|single|1)\s+copy\b/.test(normalizedInput);
  const hasTwoCopyCue = /\b(?:two|double|2)\s+cop(?:y|ies)\b/.test(normalizedInput);
  const hasCompoundCue = /(compound|comp(?:ound)?|double)\s+(heterozygous|het)/.test(normalizedInput);
  const hasWildTypeCue =
    normalizedInput.includes("wild type") ||
    normalizedInput.includes("wildtype") ||
    normalizedInput.includes("normal genotype");
  const hasNegativeCue =
    normalizedInput.includes("not detected") ||
    normalizedInput.includes("negative") ||
    normalizedInput.includes("no mutation detected") ||
    normalizedInput.includes("no variant detected");
  const hasExplicitPositiveCue = normalizedInput.includes("positive") || (normalizedInput.includes("detected") && !hasNegativeCue);
  const hasOnlyNegativeContext =
    !hasExplicitPositiveCue &&
    !hasHeterozygous &&
    !hasHomozygous &&
    !hasOneCopyCue &&
    !hasTwoCopyCue &&
    !hasCompoundCue;

  let normalizedValue: string | undefined;

  if (hasOnlyNegativeContext && (hasWildTypeCue || hasNegativeCue) && ((!hasC677T && !hasA1298C) || (hasC677T && hasA1298C))) {
    normalizedValue = "no common variant detected";
  } else if (
    hasC677T &&
    hasA1298C &&
    !hasHomozygous &&
    (hasCompoundCue || hasHeterozygous || hasOneCopyCue)
  ) {
    normalizedValue = "compound heterozygous C677T/A1298C";
  } else if (hasC677T && (hasHomozygous || hasTwoCopyCue)) {
    normalizedValue = "C677T homozygous";
  } else if (hasC677T && (hasHeterozygous || hasOneCopyCue)) {
    normalizedValue = "C677T heterozygous";
  } else if (hasA1298C && (hasHomozygous || hasTwoCopyCue)) {
    normalizedValue = "A1298C homozygous";
  } else if (hasA1298C && (hasHeterozygous || hasOneCopyCue)) {
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
