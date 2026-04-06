import { NextResponse } from "next/server";
import { normalizeReportPayload } from "@/src/lib/normalization/normalize";
import { getEvidenceRepository } from "@/src/lib/persistence";

type RawEntry = {
  name?: unknown;
  value?: unknown;
  unit?: unknown;
};

type IntakeBody = {
  patientId?: unknown;
  vendor?: unknown;
  observedAt?: unknown;
  entries?: unknown;
};

function isRawEntry(entry: RawEntry): entry is { name: string; value: number; unit?: string } {
  return (
    typeof entry.name === "string" &&
    typeof entry.value === "number" &&
    (typeof entry.unit === "string" || typeof entry.unit === "undefined")
  );
}

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

  if (typeof body.patientId !== "string" || typeof body.vendor !== "string") {
    return NextResponse.json(
      { error: "patientId and vendor are required." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.entries)) {
    return NextResponse.json(
      { error: "entries must be an array." },
      { status: 400 },
    );
  }

  const validEntries = body.entries.filter((entry): entry is { name: string; value: number; unit?: string } =>
    isRawEntry(entry as RawEntry),
  );

  try {
    const repository = getEvidenceRepository();
    const normalized = normalizeReportPayload({
      patientId: body.patientId,
      vendor: body.vendor,
      observedAt: typeof body.observedAt === "string" ? body.observedAt : new Date().toISOString(),
      entries: validEntries,
    });

    const persisted = await repository.persistNormalizedReport({
      ...normalized,
      vendor: body.vendor,
    });

    return NextResponse.json({
      patientId: body.patientId,
      vendor: body.vendor,
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
    const message = error instanceof Error ? error.message : "Unknown persistence error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
