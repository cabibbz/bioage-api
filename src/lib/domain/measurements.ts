import { CanonicalMeasurement } from "@/src/lib/domain/types";

type MeasurementValueInput = Pick<CanonicalMeasurement, "value" | "textValue" | "unit">;

export function formatMeasurementValue(input: MeasurementValueInput) {
  if (input.value !== undefined) {
    return `${input.value}${input.unit ? ` ${input.unit}` : ""}`;
  }

  if (input.textValue !== undefined) {
    return `${input.textValue}${input.unit ? ` ${input.unit}` : ""}`;
  }

  return input.unit ? `No value ${input.unit}` : "No value";
}
