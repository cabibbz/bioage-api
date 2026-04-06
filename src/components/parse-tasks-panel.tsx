import { StoredParseTask, StoredReviewDecision } from "@/src/lib/persistence/store-types";

type ParseTasksPanelProps = {
  tasks: StoredParseTask[];
  reviewDecisions: StoredReviewDecision[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ParseTasksPanel({ tasks, reviewDecisions }: ParseTasksPanelProps) {
  const reviewCounts = reviewDecisions.reduce<Record<string, number>>((counts, decision) => {
    counts[decision.parseTaskId] = (counts[decision.parseTaskId] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <section className="panel section-panel" style={{ marginBottom: 18 }}>
      <div className="section-head">
        <div>
          <div className="section-kicker">Parser Queue</div>
          <h2 className="section-title">Document parse tasks</h2>
          <p className="section-copy">
            Parse summaries stay separate from source binaries and canonical measurements. Deterministic formats finish
            immediately; ambiguous ones remain review-first.
          </p>
        </div>
        <span className="pill">{tasks.length} tasks</span>
      </div>

      <div className="detail-stack">
        {tasks.length === 0 ? (
          <div className="detail-card">
            <div className="detail-label">No parse tasks yet</div>
            <p className="detail-copy">Upload a source document to generate deterministic or review-only parser tasks.</p>
          </div>
        ) : (
          tasks.slice(0, 5).map((task) => (
            <article className="detail-card" key={task.id}>
              <div className="signal-meta">
                <div>
                  <div className="detail-label">{task.parser}</div>
                  <p className="signal-title">{task.sourceDocumentFilename}</p>
                </div>
                <span className={`pill ${task.status === "needs_review" ? "warn" : ""}`}>{task.status}</span>
              </div>

              <p className="summary-note">
                {task.mode} | {formatDate(task.updatedAt)} | {task.candidateCount} candidates |{" "}
                {reviewCounts[task.id] ?? 0} reviewed
              </p>
              <p className="detail-copy">{task.summary}</p>
              <p className="summary-note">{task.detail}</p>

              {task.metadata.length > 0 ? (
                <div className="detail-stack" style={{ marginTop: 12 }}>
                  {task.metadata.slice(0, 3).map((item) => (
                    <div className="detail-card" key={`${task.id}-${item.label}`}>
                      <div className="detail-label">{item.label}</div>
                      <p className="detail-copy">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {task.candidates.length > 0 ? (
                <div className="detail-stack" style={{ marginTop: 12 }}>
                  <div className="detail-label">Candidate values</div>
                  {task.candidates.slice(0, 3).map((candidate) => (
                    <div className="detail-card" key={candidate.id}>
                      <div className="signal-meta">
                        <p className="signal-title">{candidate.displayName}</p>
                        <span className="pill">{candidate.valueLabel}</span>
                      </div>
                      <p className="summary-note">{candidate.sourcePath}</p>
                      {candidate.loincCode || candidate.referenceRange ? (
                        <p className="detail-copy">
                          {[candidate.loincCode ? `LOINC ${candidate.loincCode}` : null, candidate.referenceRange]
                            .filter(Boolean)
                            .join(" | ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
