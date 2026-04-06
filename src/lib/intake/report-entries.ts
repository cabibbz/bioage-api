export type NormalizedReportEntry = {
  name: string;
  value: number;
  unit?: string;
};

export const reportEntriesShapeError = "Each entry must include a non-empty string name and numeric value.";

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
      unit?: unknown;
    };
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) {
      return { ok: false, error: reportEntriesShapeError };
    }

    if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) {
      return { ok: false, error: reportEntriesShapeError };
    }

    if (typeof candidate.unit !== "undefined" && typeof candidate.unit !== "string") {
      return { ok: false, error: reportEntriesShapeError };
    }

    const unit = typeof candidate.unit === "string" ? candidate.unit.trim() : undefined;
    normalizedEntries.push({
      name,
      value: candidate.value,
      ...(unit ? { unit } : {}),
    });
  }

  return { ok: true, entries: normalizedEntries };
}
