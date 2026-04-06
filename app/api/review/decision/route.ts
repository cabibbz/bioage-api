import { NextResponse } from "next/server";
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

  if (
    typeof body.patientId !== "string" ||
    typeof body.parseTaskId !== "string" ||
    typeof body.candidateId !== "string" ||
    (body.action !== "accept" && body.action !== "reject" && body.action !== "follow_up") ||
    typeof body.reviewerName !== "string"
  ) {
    return NextResponse.json(
      { error: "patientId, parseTaskId, candidateId, action, and reviewerName are required." },
      { status: 400 },
    );
  }

  try {
    const repository = getEvidenceRepository();
    const persisted = await repository.persistReviewDecision({
      patientId: body.patientId,
      parseTaskId: body.parseTaskId,
      candidateId: body.candidateId,
      action: body.action,
      reviewerName: body.reviewerName,
      note: typeof body.note === "string" ? body.note : undefined,
      proposedCanonicalCode:
        typeof body.proposedCanonicalCode === "string" && body.proposedCanonicalCode.length > 0
          ? body.proposedCanonicalCode
          : undefined,
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
    const message = error instanceof Error ? error.message : "Unknown review persistence error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
