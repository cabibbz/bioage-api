export type MeasurementModality =
  | "epigenetic"
  | "blood"
  | "wearable"
  | "clinical"
  | "stool"
  | "urine"
  | "saliva"
  | "genetic";

export type EvidenceStatus = "stable" | "improving" | "watch" | "conflicted";

export type TimelineEventType = "assessment" | "intervention" | "note";

export type CanonicalMeasurement = {
  id: string;
  title: string;
  canonicalCode: string;
  modality: MeasurementModality;
  sourceVendor: string;
  observedAt: string;
  value: number;
  unit?: string;
  interpretation: string;
  evidenceStatus: EvidenceStatus;
  confidenceLabel: "high" | "moderate" | "review";
  deltaLabel?: string;
};

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  title: string;
  detail: string;
};

export type PatientRecord = {
  id: string;
  displayName: string;
  chronologicalAge: number;
  focus: string;
  lastReviewedAt: string;
  measurements: CanonicalMeasurement[];
  timeline: TimelineEvent[];
};
