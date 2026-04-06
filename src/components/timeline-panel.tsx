import { PatientRecord } from "@/src/lib/domain/types";

type TimelinePanelProps = {
  patient: PatientRecord;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TimelinePanel({ patient }: TimelinePanelProps) {
  const improvingCount = patient.measurements.filter(
    (measurement) => measurement.evidenceStatus === "improving",
  ).length;

  const conflictCount = patient.measurements.filter(
    (measurement) => measurement.evidenceStatus === "conflicted",
  ).length;

  return (
    <section className="timeline-grid">
      <div className="panel section-panel">
        <div className="section-head">
          <div>
            <div className="section-kicker">Timeline</div>
            <h2 className="section-title">Interventions and evidence windows</h2>
            <p className="section-copy">
              The timeline should become the core workflow surface: source event, intervention, and follow-up signal
              all in one view.
            </p>
          </div>
          <span className="pill">{patient.timeline.length} tracked events</span>
        </div>

        <div className="timeline-list">
          {patient.timeline.map((event) => (
            <article className="timeline-item" key={event.id}>
              <div className="timeline-date">{formatDate(event.occurredAt)}</div>
              <h3 className="timeline-title">{event.title}</h3>
              <p className="timeline-copy">{event.detail}</p>
            </article>
          ))}
        </div>
      </div>

      <aside className="panel section-panel">
        <div className="section-head">
          <div>
            <div className="section-kicker">Review</div>
            <h2 className="section-title">Clinician prep</h2>
          </div>
        </div>

        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-label">Working focus</div>
            <p className="detail-copy">{patient.focus}</p>
          </div>

          <div className="micro-grid">
            <div className="detail-card">
              <div className="detail-label">Improving signals</div>
              <p className="summary-value">{improvingCount}</p>
            </div>
            <div className="detail-card">
              <div className="detail-label">Conflicts to review</div>
              <p className="summary-value">{conflictCount}</p>
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-label">Next product move</div>
            <p className="detail-copy">
              Attach each intervention to a measurement window and show before/after summaries instead of raw tables.
            </p>
          </div>
        </div>
      </aside>
    </section>
  );
}

