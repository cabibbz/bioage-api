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

export type CanonicalMeasurementValue =
  | {
      value: number;
      textValue?: undefined;
    }
  | {
      value?: undefined;
      textValue: string;
    };

export type CanonicalMeasurement = {
  id: string;
  title: string;
  canonicalCode: string;
  modality: MeasurementModality;
  sourceVendor: string;
  observedAt: string;
  unit?: string;
  interpretation: string;
  evidenceStatus: EvidenceStatus;
  confidenceLabel: "high" | "moderate" | "review";
  deltaLabel?: string;
} & CanonicalMeasurementValue;

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
