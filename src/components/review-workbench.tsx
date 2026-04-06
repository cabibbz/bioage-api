"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canonicalCatalog } from "@/src/lib/normalization/catalog";
import { StoredMeasurementPromotion, StoredParseTask, StoredReviewDecision } from "@/src/lib/persistence/store-types";

type ReviewWorkbenchProps = {
  tasks: StoredParseTask[];
  decisions: StoredReviewDecision[];
  promotions: StoredMeasurementPromotion[];
};

const defaultReviewerName = "Demo clinician";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ReviewWorkbench({ tasks, decisions, promotions }: ReviewWorkbenchProps) {
  const router = useRouter();
  const candidateTasks = useMemo(() => {
    const promotedDecisionIds = new Set(promotions.map((promotion) => promotion.reviewDecisionId));
    const promotedCandidateKeys = new Set(
      decisions
        .filter((decision) => promotedDecisionIds.has(decision.id))
        .map((decision) => `${decision.parseTaskId}:${decision.candidateId}`),
    );

    return tasks
      .map((task) => ({
        ...task,
        candidates: task.candidates.filter((candidate) => !promotedCandidateKeys.has(`${task.id}:${candidate.id}`)),
      }))
      .filter((task) => task.candidates.length > 0);
  }, [decisions, promotions, tasks]);
  const hasAnyCandidates = tasks.some((task) => task.candidates.length > 0);
  const [selectedTaskId, setSelectedTaskId] = useState(candidateTasks[0]?.id ?? "");
  const [selectedCandidateId, setSelectedCandidateId] = useState(candidateTasks[0]?.candidates[0]?.id ?? "");
  const [action, setAction] = useState<"accept" | "reject" | "follow_up">("accept");
  const [proposedCanonicalCode, setProposedCanonicalCode] = useState("");
  const [reviewerName, setReviewerName] = useState(defaultReviewerName);
  const [note, setNote] = useState("Looks directionally valid. Hold as reviewed candidate before promotion.");
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTask = candidateTasks.find((task) => task.id === selectedTaskId) ?? candidateTasks[0] ?? null;
  const selectedCandidate =
    selectedTask?.candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    selectedTask?.candidates[0] ??
    null;

  useEffect(() => {
    if (!selectedTask) {
      if (selectedTaskId !== "") {
        setSelectedTaskId("");
      }
      if (selectedCandidateId !== "") {
        setSelectedCandidateId("");
      }
      return;
    }

    if (selectedTask.id !== selectedTaskId) {
      setSelectedTaskId(selectedTask.id);
    }

    const candidateStillExists = selectedTask.candidates.some((candidate) => candidate.id === selectedCandidateId);
    if (!candidateStillExists) {
      setSelectedCandidateId(selectedTask.candidates[0]?.id ?? "");
    }
  }, [selectedCandidateId, selectedTask, selectedTaskId]);

  async function handleSubmit() {
    if (!selectedTask || !selectedCandidate) {
      setResult(JSON.stringify({ error: "Choose a parse task with a candidate value first." }, null, 2));
      return;
    }

    setIsSubmitting(true);
    setResult("");

    try {
      const response = await fetch("/api/review/decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: "pt_001",
          parseTaskId: selectedTask.id,
          candidateId: selectedCandidate.id,
          action,
          reviewerName,
          note,
          proposedCanonicalCode: action === "accept" ? proposedCanonicalCode || undefined : undefined,
        }),
      });

      const json = (await response.json()) as unknown;
      setResult(JSON.stringify(json, null, 2));
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setResult(JSON.stringify({ error: message }, null, 2));
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetDemo() {
    setSelectedTaskId(candidateTasks[0]?.id ?? "");
    setSelectedCandidateId(candidateTasks[0]?.candidates[0]?.id ?? "");
    setAction("accept");
    setProposedCanonicalCode("");
    setReviewerName(defaultReviewerName);
    setNote("Looks directionally valid. Hold as reviewed candidate before promotion.");
    setResult("");
  }

  return (
    <section className="panel section-panel">
      <div className="section-head">
        <div>
          <div className="section-kicker">Review Layer</div>
          <h2 className="section-title">Adjudicate parser candidates</h2>
          <p className="section-copy">
            This layer records clinician decisions and proposed mappings without mutating patient measurements yet.
          </p>
        </div>
        <span className="pill">{decisions.length} decisions</span>
      </div>

      {candidateTasks.length === 0 ? (
        <div className="detail-card">
          <div className="detail-label">{hasAnyCandidates ? "No editable candidates" : "No candidates yet"}</div>
          <p className="detail-copy">
            {hasAnyCandidates
              ? "Already-promoted candidates are removed from the editable review queue. Upload another structured source document to continue review."
              : "Upload a structured source document first so the parser can produce candidate values."}
          </p>
        </div>
      ) : (
        <>
          <div className="field-grid">
            <label className="field">
              <span className="detail-label">Parse task</span>
              <select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>
                {candidateTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.sourceDocumentFilename} | {task.parser}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="detail-label">Candidate</span>
              <select value={selectedCandidateId} onChange={(event) => setSelectedCandidateId(event.target.value)}>
                {(selectedTask?.candidates ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName} | {candidate.valueLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid" style={{ marginTop: 16 }}>
            <label className="field">
              <span className="detail-label">Action</span>
              <select value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
                <option value="accept">Accept candidate</option>
                <option value="reject">Reject candidate</option>
                <option value="follow_up">Flag for follow-up</option>
              </select>
            </label>

            <label className="field">
              <span className="detail-label">Reviewer</span>
              <input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} />
            </label>
          </div>

          <label className="field" style={{ marginTop: 16 }}>
            <span className="detail-label">Proposed canonical mapping</span>
            <select
              disabled={action !== "accept"}
              value={proposedCanonicalCode}
              onChange={(event) => setProposedCanonicalCode(event.target.value)}
            >
              <option value="">No canonical mapping yet</option>
              {canonicalCatalog.map((item) => (
                <option key={item.canonicalCode} value={item.canonicalCode}>
                  {item.title} | {item.canonicalCode}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ marginTop: 16 }}>
            <span className="detail-label">Note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>

          {selectedCandidate ? (
            <div className="detail-card" style={{ marginTop: 16 }}>
              <div className="detail-label">Candidate snapshot</div>
              <p className="detail-copy">
                {selectedCandidate.displayName} | {selectedCandidate.valueLabel}
              </p>
              <p className="summary-note">{selectedCandidate.sourcePath}</p>
            </div>
          ) : null}

          <div className="actions">
            <button className="button button-primary" disabled={isSubmitting} onClick={handleSubmit} type="button">
              {isSubmitting ? "Saving..." : "Save review decision"}
            </button>
            <button className="button button-secondary" onClick={resetDemo} type="button">
              Reset demo
            </button>
          </div>
        </>
      )}

      <div className="result-box">
        <pre>{result || "Review-decision output will appear here."}</pre>
      </div>

      {decisions.length > 0 ? (
        <div className="detail-stack" style={{ marginTop: 16 }}>
          <div className="detail-label">Recent decisions</div>
          {decisions.slice(0, 4).map((decision) => (
            <article className="detail-card" key={decision.id}>
              <div className="signal-meta">
                <div>
                  <p className="signal-title">{decision.candidateDisplayName}</p>
                  <p className="summary-note">
                    {decision.reviewerName} | {formatDate(decision.updatedAt)}
                  </p>
                </div>
                <span className={`pill ${decision.action === "reject" ? "warn" : ""}`}>{decision.action}</span>
              </div>
              <p className="detail-copy">
                {decision.candidateValueLabel}
                {decision.proposedTitle ? ` -> ${decision.proposedTitle}` : ""}
              </p>
              {decision.note ? <p className="summary-note">{decision.note}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
