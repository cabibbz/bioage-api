import { NextResponse } from "next/server";
import { toRouteErrorResponse } from "@/src/lib/api/route-error";
import { isValidIsoTimestamp, readOptionalString, readRequiredString } from "@/src/lib/api/validation";
import { normalizeReportEntries } from "@/src/lib/intake/report-entries";
import { normalizeReportPayload } from "@/src/lib/normalization/normalize";
import { getEvidenceRepository } from "@/src/lib/persistence";

type IntakeBody = {
  patientId?: unknown;
  vendor?: unknown;
  observedAt?: unknown;
  entries?: unknown;
};

export async function POST(request: Request) {
  let body: IntakeBody;

  try {
    body = (await request.json()) as IntakeBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const patientId = readRequiredString(body.patientId);
  const vendor = readRequiredString(body.vendor);
  const observedAt = readOptionalString(body.observedAt);

  if (!patientId || !vendor) {
    return NextResponse.json(
      { error: "patientId and vendor are required." },
      { status: 400 },
    );
  }

  if (observedAt && !isValidIsoTimestamp(observedAt)) {
    return NextResponse.json(
      { error: "observedAt must be a valid ISO-8601 timestamp." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.entries)) {
    return NextResponse.json(
      { error: "entries must be an array." },
      { status: 400 },
    );
  }

  const normalizedEntries = normalizeReportEntries(body.entries);
  if (!normalizedEntries.ok) {
    return NextResponse.json(
      { error: normalizedEntries.error },
      { status: 400 },
    );
  }

  try {
    const repository = getEvidenceRepository();
    const normalized = normalizeReportPayload({
      patientId,
      vendor,
      observedAt: observedAt ?? new Date().toISOString(),
      entries: normalizedEntries.entries,
    });

    const persisted = await repository.persistNormalizedReport({
      ...normalized,
      vendor,
    });

    return NextResponse.json({
      patientId,
      vendor,
      observedAt: normalized.observedAt,
      ingestionId: persisted.ingestion.id,
      normalizationSummary: {
        totalEntries: body.entries.length,
        mappedEntries: normalized.measurements.length,
        unmappedEntries: normalized.unmappedEntries.length,
      },
      measurements: normalized.measurements,
      unmappedEntries: normalized.unmappedEntries,
      patientSnapshot: {
        lastReviewedAt: persisted.patient.lastReviewedAt,
        totalMeasurements: persisted.patient.measurements.length,
        totalTimelineEvents: persisted.patient.timeline.length,
      },
      nextActions: [
        "Persist the source document binary and checksum for provenance.",
        "Add parser confidence scores at the field level.",
        "Introduce clinician review queues for newly unmapped source metrics.",
      ],
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unknown persistence error.");
  }
}
