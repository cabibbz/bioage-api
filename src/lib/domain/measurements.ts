import { CanonicalMeasurement } from "@/src/lib/domain/types";

type MeasurementValueInput = Pick<CanonicalMeasurement, "value" | "textValue" | "unit">;
const boundedValuePattern = /^(<=|>=|<|>)/;

export function getMeasurementValueKind(input: MeasurementValueInput) {
  if (input.value !== undefined) {
    return "numeric" as const;
  }

  if (input.textValue !== undefined && boundedValuePattern.test(input.textValue.trim())) {
    return "bounded" as const;
  }

  return "text" as const;
}

export function getMeasurementValueKindLabel(input: MeasurementValueInput) {
  const kind = getMeasurementValueKind(input);
  if (kind === "bounded") {
    return "bounded result";
  }

  if (kind === "text") {
    return "text result";
  }

  return undefined;
}

export function formatMeasurementValue(input: MeasurementValueInput) {
  if (input.value !== undefined) {
    return `${input.value}${input.unit ? ` ${input.unit}` : ""}`;
  }

  if (input.textValue !== undefined) {
    return `${input.textValue}${input.unit ? ` ${input.unit}` : ""}`;
  }

  return input.unit ? `No value ${input.unit}` : "No value";
}
