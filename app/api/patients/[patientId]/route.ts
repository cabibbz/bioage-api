import { NextResponse } from "next/server";
import { getEvidenceRepository } from "@/src/lib/persistence";

type RouteContext = {
  params: Promise<{
    patientId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { patientId } = await context.params;
  const repository = getEvidenceRepository();
  const patient = await repository.getPatientRecord(patientId);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const reportIngestions = await repository.listReportIngestions(patientId);
  const sourceDocuments = await repository.listSourceDocuments(patientId);
  const parseTasks = await repository.listParseTasks(patientId);
  const reviewDecisions = await repository.listReviewDecisions(patientId);
  const measurementPromotions = await repository.listMeasurementPromotions(patientId);

  return NextResponse.json({
    patient,
    reportIngestions,
    sourceDocuments,
    parseTasks,
    reviewDecisions,
    measurementPromotions,
  });
}
