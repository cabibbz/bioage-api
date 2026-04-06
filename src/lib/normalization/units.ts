import { CanonicalDefinition } from "@/src/lib/normalization/catalog";

export type UnitNormalizationResult = {
  value: number;
  unit?: string;
  note?: string;
};

function normalizeUnitKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u00b5\u03bc]/g, "u")
    .replace(/\s+/g, "");
}

function matchesUnit(left: string | undefined, right: string | undefined) {
  return Boolean(left && right && normalizeUnitKey(left) === normalizeUnitKey(right));
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function buildConvertedUnitResult(input: {
  definition: CanonicalDefinition;
  value: number;
  reportedUnit: string;
  convertedValue: number;
  note: string;
}) {
  return {
    value: input.convertedValue,
    unit: input.definition.preferredUnit,
    note: `Converted reported ${input.definition.title} from ${input.value} ${input.reportedUnit} to ${input.convertedValue} ${input.definition.preferredUnit} ${input.note}`,
  } satisfies UnitNormalizationResult;
}

function describeKnownUnits(definition: CanonicalDefinition) {
  const alternateUnits = definition.alternateUnits ?? [];
  if (alternateUnits.length === 0) {
    return definition.preferredUnit;
  }

  return `${definition.preferredUnit} (alternate: ${alternateUnits.join(", ")})`;
}

export function resolveMeasurementUnit(
  definition: CanonicalDefinition,
  value: number,
  reportedUnit?: string,
): UnitNormalizationResult {
  if (!reportedUnit) {
    return {
      value,
      unit: definition.preferredUnit,
    };
  }

  if (matchesUnit(reportedUnit, definition.preferredUnit)) {
    return {
      value,
      unit: definition.preferredUnit,
    };
  }

  if (definition.canonicalCode === "hba1c" && matchesUnit(reportedUnit, "mmol/mol")) {
    const convertedValue = roundTo(value * 0.09148 + 2.152, 2);
    return buildConvertedUnitResult({
      definition,
      value,
      reportedUnit,
      convertedValue,
      note: "using the NGSP/IFCC master equation.",
    });
  }

  if (definition.canonicalCode === "lp_a" && matchesUnit(reportedUnit, "mg/dL")) {
    return {
      value,
      unit: reportedUnit,
      note: `Preserved reported ${reportedUnit} without conversion because Lp(a) mass and molar units are not directly interchangeable.`,
    };
  }

  if (definition.canonicalCode === "fasting_glucose" && matchesUnit(reportedUnit, "mmol/L")) {
    const convertedValue = roundTo(value / 0.0555, 1);
    return buildConvertedUnitResult({
      definition,
      value,
      reportedUnit,
      convertedValue,
      note: "using the standard glucose factor 0.0555 mmol/L per mg/dL.",
    });
  }

  if (
    ["ldl_cholesterol", "hdl_cholesterol"].includes(definition.canonicalCode) &&
    matchesUnit(reportedUnit, "mmol/L")
  ) {
    const convertedValue = roundTo(value / 0.0259, 1);
    return buildConvertedUnitResult({
      definition,
      value,
      reportedUnit,
      convertedValue,
      note: "using the standard cholesterol factor 0.0259 mmol/L per mg/dL.",
    });
  }

  if (definition.canonicalCode === "triglycerides" && matchesUnit(reportedUnit, "mmol/L")) {
    const convertedValue = roundTo(value / 0.0113, 1);
    return buildConvertedUnitResult({
      definition,
      value,
      reportedUnit,
      convertedValue,
      note: "using the standard triglyceride factor 0.0113 mmol/L per mg/dL.",
    });
  }

  if (definition.canonicalCode === "vitamin_d" && matchesUnit(reportedUnit, "nmol/L")) {
    const convertedValue = roundTo(value / 2.5, 1);
    return buildConvertedUnitResult({
      definition,
      value,
      reportedUnit,
      convertedValue,
      note: "using the standard 25-hydroxy vitamin D factor 2.5 nmol/L per ng/mL.",
    });
  }

  const knownUnits = [definition.preferredUnit, ...(definition.alternateUnits ?? [])];
  if (knownUnits.some((unit) => matchesUnit(reportedUnit, unit))) {
    return {
      value,
      unit: reportedUnit,
      note: `Preserved reported ${reportedUnit} because ${definition.title} does not yet have an explicit conversion rule for that alternate unit.`,
    };
  }

  return {
    value,
    unit: reportedUnit,
    note: `Preserved reported ${reportedUnit}; catalog guidance for ${definition.title} expects ${describeKnownUnits(definition)}.`,
  };
}
