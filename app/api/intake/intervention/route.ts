import { NextResponse } from "next/server";
import { toRouteErrorResponse } from "@/src/lib/api/route-error";
import { readRequiredString } from "@/src/lib/api/validation";
import { getEvidenceRepository } from "@/src/lib/persistence";

type InterventionBody = {
  patientId?: unknown;
  title?: unknown;
  detail?: unknown;
  occurredAt?: unknown;
};

export async function POST(request: Request) {
  let body: InterventionBody;

  try {
    body = (await request.json()) as InterventionBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const patientId = readRequiredString(body.patientId);
  const title = readRequiredString(body.title);
  const detail = readRequiredString(body.detail);
  const occurredAt = readRequiredString(body.occurredAt);

  if (
    !patientId ||
    !title ||
    !detail ||
    !occurredAt
  ) {
    return NextResponse.json(
      { error: "patientId, title, detail, and occurredAt are required." },
      { status: 400 },
    );
  }

  try {
    const repository = getEvidenceRepository();
    const patient = await repository.addInterventionEvent({
      patientId,
      title,
      detail,
      occurredAt,
    });

    return NextResponse.json({
      patientSnapshot: {
        totalTimelineEvents: patient.timeline.length,
        lastReviewedAt: patient.lastReviewedAt,
      },
      nextActions: [
        "Attach a structured intervention type and category.",
        "Link interventions to outcome windows at 30, 60, and 90 days.",
        "Add clinician ownership and follow-up status.",
      ],
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unknown persistence error.");
  }
}
