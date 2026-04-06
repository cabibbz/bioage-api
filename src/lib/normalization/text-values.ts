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
  if (normalizeWhitespace(sourceValue) === normalizedValue) {
    return undefined;
  }

  return `Normalized reported ${title} notation from "${normalizeWhitespace(sourceValue)}" to "${normalizedValue}".`;
}

function normalizeQualitativeKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, "-");
}

function normalizeBoundedNumericToken(value: string) {
  return value.replace(/,/g, "").replace(/^\+/, "");
}

function normalizeGenericBoundedText(title: string, sourceValue: string): TextNormalizationResult | undefined {
  const normalizedSource = normalizeWhitespace(sourceValue).replace(/\u2264/g, "<=").replace(/\u2265/g, ">=");
  const directOperatorMatch = normalizedSource.match(
    /^(<=|>=|<|>)\s*([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))$/,
  );

  if (directOperatorMatch) {
    const normalizedValue = `${directOperatorMatch[1]}${normalizeBoundedNumericToken(directOperatorMatch[2])}`;
    return {
      textValue: normalizedValue,
      note: buildCanonicalizationNote(title, sourceValue, normalizedValue),
    };
  }

  const boundedKey = normalizeWhitespace(sourceValue).toLowerCase();
  const detectionLimitPatterns = [
    {
      pattern:
        /^(?:below|under)(?:\s+the)?\s+(?:detection|assay|reportable|reporting|quantitation|quantification)\s+limit(?:\s+of(?:\s+(?:detection|quantitation|quantification|reporting))?)?\s*[:(]?\s*([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\)?$/,
      operator: "<",
    },
    {
      pattern:
        /^(?:above|over)(?:\s+the)?\s+(?:detection|assay|reportable|reporting|quantitation|quantification)\s+limit(?:\s+of(?:\s+(?:detection|quantitation|quantification|reporting))?)?\s*[:(]?\s*([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\)?$/,
      operator: ">",
    },
  ];

  for (const { pattern, operator } of detectionLimitPatterns) {
    const match = boundedKey.match(pattern);
    if (!match) {
      continue;
    }

    const normalizedValue = `${operator}${normalizeBoundedNumericToken(match[1])}`;
    return {
      textValue: normalizedValue,
      note: buildCanonicalizationNote(title, sourceValue, normalizedValue),
    };
  }

  const boundedPatterns = [
    {
      pattern: /^(?:less than or equal to|at most|no more than)\s+([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))$/,
      operator: "<=",
    },
    {
      pattern: /^(?:greater than or equal to|at least|no less than)\s+([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))$/,
      operator: ">=",
    },
    {
      pattern: /^(?:less than|below|under)\s+([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))$/,
      operator: "<",
    },
    {
      pattern: /^(?:greater than|above|over)\s+([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))$/,
      operator: ">",
    },
  ];

  for (const { pattern, operator } of boundedPatterns) {
    const match = boundedKey.match(pattern);
    if (!match) {
      continue;
    }

    const normalizedValue = `${operator}${normalizeBoundedNumericToken(match[1])}`;
    return {
      textValue: normalizedValue,
      note: buildCanonicalizationNote(title, sourceValue, normalizedValue),
    };
  }

  return undefined;
}

function normalizeGenericTextValue(title: string, sourceValue: string): TextNormalizationResult {
  const boundedResult = normalizeGenericBoundedText(title, sourceValue);
  if (boundedResult) {
    return boundedResult;
  }

  return normalizeGenericQualitativeText(title, sourceValue);
}

function normalizeGenericQualitativeText(title: string, sourceValue: string): TextNormalizationResult {
  const normalizedSource = normalizeWhitespace(sourceValue);
  const qualitativeKey = normalizeQualitativeKey(sourceValue);

  let normalizedValue: string | undefined;

  if (/^borderline[\s-]+high$/.test(qualitativeKey)) {
    normalizedValue = "borderline high";
  } else if (/^borderline[\s-]+low$/.test(qualitativeKey)) {
    normalizedValue = "borderline low";
  } else if (/^(positive|pos|positive result)$/.test(qualitativeKey)) {
    normalizedValue = "positive";
  } else if (/^(negative|neg|negative result)$/.test(qualitativeKey)) {
    normalizedValue = "negative";
  } else if (/^(detected|detected result)$/.test(qualitativeKey)) {
    normalizedValue = "detected";
  } else if (/^(not[\s-]*detected|none detected|undetected)$/.test(qualitativeKey)) {
    normalizedValue = "not detected";
  } else if (/^reactive$/.test(qualitativeKey)) {
    normalizedValue = "reactive";
  } else if (/^non[\s-]*reactive$/.test(qualitativeKey)) {
    normalizedValue = "non-reactive";
  } else if (/^(normal|within normal limits)$/.test(qualitativeKey)) {
    normalizedValue = "normal";
  } else if (/^(abnormal|out of range)$/.test(qualitativeKey)) {
    normalizedValue = "abnormal";
  } else if (/^(equivocal|indeterminate)$/.test(qualitativeKey)) {
    normalizedValue = qualitativeKey;
  } else if (/^(present|absent)$/.test(qualitativeKey)) {
    normalizedValue = qualitativeKey;
  }

  if (!normalizedValue) {
    return {
      textValue: normalizedSource,
    };
  }

  return {
    textValue: normalizedValue,
    note: buildCanonicalizationNote(title, sourceValue, normalizedValue),
  };
}

function finalizeTextNormalization(
  title: string,
  sourceValue: string,
  result: TextNormalizationResult,
): TextNormalizationResult {
  const normalizedSource = normalizeWhitespace(sourceValue);

  if (result.note || result.textValue !== normalizedSource) {
    return result;
  }

  return normalizeGenericTextValue(title, sourceValue);
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

  return finalizeTextNormalization("ApoE genotype", sourceValue, {
    textValue: normalizedValue,
    note: buildCanonicalizationNote("ApoE genotype", sourceValue, normalizedValue),
  });
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
    return finalizeTextNormalization("MTHFR status", sourceValue, {
      textValue: normalizeWhitespace(sourceValue),
    });
  }

  return finalizeTextNormalization("MTHFR status", sourceValue, {
    textValue: normalizedValue,
    note: buildCanonicalizationNote("MTHFR status", sourceValue, normalizedValue),
  });
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

  return normalizeGenericTextValue(definition.title, sourceValue);
}
