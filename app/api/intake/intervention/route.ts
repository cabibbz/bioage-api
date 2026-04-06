import { NextResponse } from "next/server";
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

  if (
    typeof body.patientId !== "string" ||
    typeof body.title !== "string" ||
    typeof body.detail !== "string" ||
    typeof body.occurredAt !== "string"
  ) {
    return NextResponse.json(
      { error: "patientId, title, detail, and occurredAt are required." },
      { status: 400 },
    );
  }

  try {
    const repository = getEvidenceRepository();
    const patient = await repository.addInterventionEvent({
      patientId: body.patientId,
      title: body.title,
      detail: body.detail,
      occurredAt: body.occurredAt,
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
    const message = error instanceof Error ? error.message : "Unknown persistence error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
