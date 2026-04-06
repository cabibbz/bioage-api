import { NextResponse } from "next/server";
import { toRouteErrorResponse } from "@/src/lib/api/route-error";
import { getEvidenceRepository } from "@/src/lib/persistence";

type PromoteRequest = {
  patientId?: unknown;
  reviewDecisionId?: unknown;
};

export async function POST(request: Request) {
  let body: PromoteRequest;

  try {
    body = (await request.json()) as PromoteRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.patientId !== "string" || typeof body.reviewDecisionId !== "string") {
    return NextResponse.json({ error: "patientId and reviewDecisionId are required." }, { status: 400 });
  }

  try {
    const repository = getEvidenceRepository();
    const promoted = await repository.promoteReviewDecision({
      patientId: body.patientId,
      reviewDecisionId: body.reviewDecisionId,
    });

    return NextResponse.json({
      promotion: promoted.promotion,
      measurement: promoted.measurement,
      alreadyPromoted: promoted.alreadyPromoted,
      patientSnapshot: {
        lastReviewedAt: promoted.patient.lastReviewedAt,
        totalMeasurements: promoted.patient.measurements.length,
        totalTimelineEvents: promoted.patient.timeline.length,
      },
      nextActions: [
        "Review the promoted measurement in the patient signal board.",
        "Track promotion rates by parser, source system, and canonical code.",
        "Add field-level promotion audit UI before enabling bulk promotion.",
      ],
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unknown promotion error.");
  }
}
