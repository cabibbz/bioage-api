export type NormalizedReportEntry =
  | {
      name: string;
      value: number;
      textValue?: undefined;
      unit?: string;
    }
  | {
      name: string;
      value?: undefined;
      textValue: string;
      unit?: string;
    };

export const reportEntriesShapeError =
  "Each entry must include a non-empty string name plus either numeric value or non-empty textValue.";

export function normalizeReportEntries(
  entries: unknown[],
): { ok: true; entries: NormalizedReportEntry[] } | { ok: false; error: string } {
  const normalizedEntries: NormalizedReportEntry[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: reportEntriesShapeError };
    }

    const candidate = entry as {
      name?: unknown;
      value?: unknown;
      textValue?: unknown;
      unit?: unknown;
    };
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) {
      return { ok: false, error: reportEntriesShapeError };
    }

    const hasNumericValue = typeof candidate.value === "number" && Number.isFinite(candidate.value);
    const textValue = typeof candidate.textValue === "string" ? candidate.textValue.trim() : "";
    const hasTextValue = Boolean(textValue);

    if (hasNumericValue === hasTextValue) {
      return { ok: false, error: reportEntriesShapeError };
    }

    if (typeof candidate.unit !== "undefined" && typeof candidate.unit !== "string") {
      return { ok: false, error: reportEntriesShapeError };
    }

    const unit = typeof candidate.unit === "string" ? candidate.unit.trim() : undefined;
    normalizedEntries.push(
      hasNumericValue
        ? {
            name,
            value: candidate.value as number,
            ...(unit ? { unit } : {}),
          }
        : {
            name,
            textValue,
            ...(unit ? { unit } : {}),
          },
    );
  }

  return { ok: true, entries: normalizedEntries };
}
