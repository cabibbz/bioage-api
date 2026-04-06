import {
  addInterventionEvent,
  getPatientRecord,
  listMeasurementPromotions,
  listParseTasks,
  listReportIngestions,
  listReviewDecisions,
  listSourceDocuments,
  persistNormalizedReport,
  persistReviewDecision,
  persistSourceDocumentUpload,
  promoteReviewDecision,
} from "@/src/lib/persistence/store";
import { EvidenceRepository } from "@/src/lib/persistence/repository";

export const fileEvidenceRepository: EvidenceRepository = {
  getPatientRecord,
  listReportIngestions,
  listSourceDocuments,
  listParseTasks,
  listReviewDecisions,
  listMeasurementPromotions,
  persistNormalizedReport,
  addInterventionEvent,
  persistSourceDocumentUpload,
  persistReviewDecision,
  promoteReviewDecision,
};
