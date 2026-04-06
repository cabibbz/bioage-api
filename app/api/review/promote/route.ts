import { NextResponse } from "next/server";
import { toRouteErrorResponse } from "@/src/lib/api/route-error";
import { readRequiredString } from "@/src/lib/api/validation";
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

  const patientId = readRequiredString(body.patientId);
  const reviewDecisionId = readRequiredString(body.reviewDecisionId);

  if (!patientId || !reviewDecisionId) {
    return NextResponse.json({ error: "patientId and reviewDecisionId are required." }, { status: 400 });
  }

  try {
    const repository = getEvidenceRepository();
    const promoted = await repository.promoteReviewDecision({
      patientId,
      reviewDecisionId,
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
        "Harden value-type-specific interpretation and display rules for bounded and categorical promotions.",
        "Track promotion rates by parser, source system, and canonical code.",
        "Add field-level promotion audit UI before enabling bulk promotion.",
      ],
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unknown promotion error.");
  }
}
