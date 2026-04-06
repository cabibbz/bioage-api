import { NextResponse } from "next/server";
import { toRouteErrorResponse } from "@/src/lib/api/route-error";
import { readOptionalString, readRequiredString } from "@/src/lib/api/validation";
import { getEvidenceRepository } from "@/src/lib/persistence";

type ReviewDecisionRequest = {
  patientId?: unknown;
  parseTaskId?: unknown;
  candidateId?: unknown;
  action?: unknown;
  reviewerName?: unknown;
  note?: unknown;
  proposedCanonicalCode?: unknown;
};

export async function POST(request: Request) {
  let body: ReviewDecisionRequest;

  try {
    body = (await request.json()) as ReviewDecisionRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const patientId = readRequiredString(body.patientId);
  const parseTaskId = readRequiredString(body.parseTaskId);
  const candidateId = readRequiredString(body.candidateId);
  const reviewerName = readRequiredString(body.reviewerName);
  const note = readOptionalString(body.note);
  const proposedCanonicalCode = readOptionalString(body.proposedCanonicalCode);

  if (
    !patientId ||
    !parseTaskId ||
    !candidateId ||
    (body.action !== "accept" && body.action !== "reject" && body.action !== "follow_up") ||
    !reviewerName
  ) {
    return NextResponse.json(
      { error: "patientId, parseTaskId, candidateId, action, and reviewerName are required." },
      { status: 400 },
    );
  }

  try {
    const repository = getEvidenceRepository();
    const persisted = await repository.persistReviewDecision({
      patientId,
      parseTaskId,
      candidateId,
      action: body.action,
      reviewerName,
      note,
      proposedCanonicalCode,
    });

    return NextResponse.json({
      decision: persisted.decision,
      patientSnapshot: {
        lastReviewedAt: persisted.patient.lastReviewedAt,
        totalTimelineEvents: persisted.patient.timeline.length,
      },
      nextActions:
        persisted.decision.action === "accept"
          ? [
              "Promote accepted numeric decisions into canonical measurements when appropriate.",
              "Keep review and promotion audit trails separate from the source file.",
              "Track acceptance rates by parser and source system.",
            ]
      : [
          "Preserve the rejected or follow-up decision for auditability.",
          "Use note text to refine parser heuristics or mapping rules.",
          "Do not promote this candidate until a later review changes the decision.",
        ],
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unknown review persistence error.");
  }
}
