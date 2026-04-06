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
    return {
      value: convertedValue,
      unit: definition.preferredUnit,
      note: `Converted reported HbA1c from ${value} ${reportedUnit} to ${convertedValue} ${definition.preferredUnit} using the NGSP/IFCC master equation.`,
    };
  }

  if (definition.canonicalCode === "lp_a" && matchesUnit(reportedUnit, "mg/dL")) {
    return {
      value,
      unit: reportedUnit,
      note: `Preserved reported ${reportedUnit} without conversion because Lp(a) mass and molar units are not directly interchangeable.`,
    };
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
