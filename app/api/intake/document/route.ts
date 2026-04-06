import { NextResponse } from "next/server";
import { toRouteErrorResponse } from "@/src/lib/api/route-error";
import { getEvidenceRepository } from "@/src/lib/persistence";

export async function POST(request: Request) {
  const formData = await request.formData();
  const patientId = formData.get("patientId");
  const sourceSystem = formData.get("sourceSystem");
  const observedAt = formData.get("observedAt");
  const file = formData.get("file");

  if (typeof patientId !== "string" || typeof sourceSystem !== "string" || !(file instanceof File)) {
    return NextResponse.json(
      { error: "patientId, sourceSystem, and file are required." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const repository = getEvidenceRepository();
    const persisted = await repository.persistSourceDocumentUpload({
      patientId,
      sourceSystem,
      originalFilename: file.name,
      mimeType: file.type,
      bytes,
      observedAt: typeof observedAt === "string" && observedAt.length > 0 ? observedAt : undefined,
    });

    return NextResponse.json({
      document: persisted.document,
      extractedChildDocuments: persisted.extractedChildDocuments,
      parseTasks: persisted.parseTasks,
      patientSnapshot: {
        lastReviewedAt: persisted.patient.lastReviewedAt,
        totalTimelineEvents: persisted.patient.timeline.length,
      },
      archivePreview:
        persisted.document.classification === "zip_archive"
          ? {
              entryCount: persisted.document.archiveEntries?.length ?? 0,
              extractedChildCount: persisted.extractedChildDocuments.length,
              sampleEntries: persisted.document.archiveEntries?.slice(0, 12) ?? [],
            }
          : null,
      nextActions:
        persisted.document.classification === "zip_archive"
          ? [
              "Review completed parse summaries for extracted child documents.",
              "Map safe candidate measurements into clinician review flows.",
              "Add recursive handling for nested archives only if design partners need it.",
            ]
      : [
          "Review the parse task summary and candidate measurements.",
          "Store field-level review decisions separately from the source file.",
          "Promote structured values into canonical measurements only after review.",
        ],
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unknown document persistence error.");
  }
}
