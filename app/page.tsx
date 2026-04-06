import { AppShell } from "@/src/components/app-shell";
import { getEvidenceRepository } from "@/src/lib/persistence";

export const dynamic = "force-dynamic";

export default async function Home() {
  const repository = getEvidenceRepository();
  const patient = await repository.getPatientRecord("pt_001");
  const sourceDocuments = await repository.listSourceDocuments("pt_001");
  const parseTasks = await repository.listParseTasks("pt_001");
  const reviewDecisions = await repository.listReviewDecisions("pt_001");
  const measurementPromotions = await repository.listMeasurementPromotions("pt_001");

  if (!patient) {
    throw new Error("The seeded patient record was not found.");
  }

  return (
    <AppShell
      patient={patient}
      sourceDocuments={sourceDocuments}
      parseTasks={parseTasks}
      reviewDecisions={reviewDecisions}
      measurementPromotions={measurementPromotions}
    />
  );
}
