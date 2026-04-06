import { DocumentUploadWorkbench } from "@/src/components/document-upload-workbench";
import { InterventionWorkbench } from "@/src/components/intervention-workbench";
import { ParseTasksPanel } from "@/src/components/parse-tasks-panel";
import { PromotionWorkbench } from "@/src/components/promotion-workbench";
import { ReviewWorkbench } from "@/src/components/review-workbench";
import { SignalCard } from "@/src/components/signal-card";
import { SourceDocumentsPanel } from "@/src/components/source-documents-panel";
import { TimelinePanel } from "@/src/components/timeline-panel";
import { UploadWorkbench } from "@/src/components/upload-workbench";
import { PatientRecord } from "@/src/lib/domain/types";
import {
  StoredMeasurementPromotion,
  StoredParseTask,
  StoredReviewDecision,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";

type AppShellProps = {
  patient: PatientRecord;
  sourceDocuments: StoredSourceDocument[];
  parseTasks: StoredParseTask[];
  reviewDecisions: StoredReviewDecision[];
  measurementPromotions: StoredMeasurementPromotion[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function AppShell({
  patient,
  sourceDocuments,
  parseTasks,
  reviewDecisions,
  measurementPromotions,
}: AppShellProps) {
  const latestSignals = patient.measurements.slice(0, 3);
  const conflictedSignals = patient.measurements.filter(
    (measurement) => measurement.evidenceStatus === "conflicted" || measurement.evidenceStatus === "watch",
  );

  return (
    <main className="page-shell">
      <section className="hero-grid">
        <div className="panel hero-panel">
          <span className="eyebrow">Preventive Evidence Layer</span>
          <h1 className="hero-title">Make aging data clinically comparable before you try to make it magical.</h1>
          <p className="hero-copy">
            The product wedge is not another age score. It is report ingestion, source-preserving normalization,
            longitudinal comparison, and intervention-aware review inside real clinic workflow.
          </p>

          <div className="summary-grid">
            <article className="summary-card">
              <div className="summary-label">Patient</div>
              <div className="summary-value">{patient.displayName}</div>
              <p className="summary-note">{patient.chronologicalAge} years old, longitudinal preventive review.</p>
            </article>

            <article className="summary-card">
              <div className="summary-label">Last review</div>
              <div className="summary-value">{formatDate(patient.lastReviewedAt)}</div>
              <p className="summary-note">This surface should become the visit-prep screen for repeat follow-ups.</p>
            </article>

            <article className="summary-card">
              <div className="summary-label">Design constraint</div>
              <div className="summary-value">Provenance first</div>
              <p className="summary-note">Never overwrite the vendor signal. Always map source and canonical side by side.</p>
            </article>
          </div>
        </div>

        <div className="panel-stack">
          <section className="panel section-panel">
            <div className="section-head">
              <div>
                <div className="section-kicker">Immediate value</div>
                <h2 className="section-title">What the first customers are buying</h2>
              </div>
            </div>

            <div className="detail-stack">
              <div className="detail-card">
                <div className="detail-label">Job to be done</div>
                <p className="detail-copy">Unify aging, lab, and wearable inputs without making clinicians live inside five portals.</p>
              </div>
              <div className="detail-card">
                <div className="detail-label">Moat to earn</div>
                <p className="detail-copy">Build the best paired dataset for source-vs-canonical mappings, conflicts, and intervention-linked outcomes.</p>
              </div>
            </div>
          </section>

          <section className="panel section-panel">
            <div className="section-head">
              <div>
                <div className="section-kicker">Open issues</div>
                <h2 className="section-title">Signals needing clinician review</h2>
              </div>
              <span className="pill warn">{conflictedSignals.length} flagged</span>
            </div>

            <div className="detail-stack">
              {conflictedSignals.map((measurement) => (
                <div className="detail-card" key={measurement.id}>
                  <div className="detail-label">{measurement.title}</div>
                  <p className="detail-copy">{measurement.interpretation}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="panel section-panel" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <div>
            <div className="section-kicker">Signal board</div>
            <h2 className="section-title">Modality-aware evidence cards</h2>
            <p className="section-copy">
              Keep the sources separate. The clinician should see what each modality says before any aggregate scoring.
            </p>
          </div>
        </div>

        <div className="card-grid">
          {latestSignals.map((measurement) => (
            <SignalCard key={measurement.id} measurement={measurement} />
          ))}
        </div>
      </section>

      <SourceDocumentsPanel documents={sourceDocuments} />

      <ParseTasksPanel tasks={parseTasks} reviewDecisions={reviewDecisions} />

      <TimelinePanel patient={patient} />

      <div style={{ height: 18 }} />

      <section className="workbench-grid">
        <DocumentUploadWorkbench />
        <ReviewWorkbench tasks={parseTasks} decisions={reviewDecisions} promotions={measurementPromotions} />
        <PromotionWorkbench decisions={reviewDecisions} promotions={measurementPromotions} />
        <UploadWorkbench />
        <InterventionWorkbench />
      </section>
    </main>
  );
}
