"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StoredMeasurementPromotion, StoredParseTask, StoredReviewDecision } from "@/src/lib/persistence/store-types";

type PromotionWorkbenchProps = {
  tasks: StoredParseTask[];
  decisions: StoredReviewDecision[];
  promotions: StoredMeasurementPromotion[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PromotionWorkbench({ tasks, decisions, promotions }: PromotionWorkbenchProps) {
  const router = useRouter();
  const promotableCandidateKeys = useMemo(() => {
    return new Set(
      tasks.flatMap((task) =>
        task.candidates
          .filter((candidate) => candidate.numericValue !== undefined)
          .map((candidate) => `${task.id}:${candidate.id}`),
      ),
    );
  }, [tasks]);
  const pendingAcceptedDecisions = useMemo(() => {
    const promotedDecisionIds = new Set(promotions.map((promotion) => promotion.reviewDecisionId));
    return decisions.filter(
      (decision) =>
        decision.action === "accept" &&
        decision.proposedCanonicalCode &&
        promotableCandidateKeys.has(`${decision.parseTaskId}:${decision.candidateId}`) &&
        !promotedDecisionIds.has(decision.id),
    );
  }, [decisions, promotableCandidateKeys, promotions]);

  const [selectedDecisionId, setSelectedDecisionId] = useState(pendingAcceptedDecisions[0]?.id ?? "");
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (pendingAcceptedDecisions.length === 0) {
      if (selectedDecisionId !== "") {
        setSelectedDecisionId("");
      }
      return;
    }

    const stillExists = pendingAcceptedDecisions.some((decision) => decision.id === selectedDecisionId);
    if (!stillExists) {
      setSelectedDecisionId(pendingAcceptedDecisions[0].id);
    }
  }, [pendingAcceptedDecisions, selectedDecisionId]);

  const selectedDecision =
    pendingAcceptedDecisions.find((decision) => decision.id === selectedDecisionId) ??
    pendingAcceptedDecisions[0] ??
    null;

  async function handleSubmit() {
    if (!selectedDecision) {
      setResult(JSON.stringify({ error: "Choose an accepted review decision first." }, null, 2));
      return;
    }

    setIsSubmitting(true);
    setResult("");

    try {
      const response = await fetch("/api/review/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: "pt_001",
          reviewDecisionId: selectedDecision.id,
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
    setSelectedDecisionId(pendingAcceptedDecisions[0]?.id ?? "");
    setResult("");
  }

  return (
    <section className="panel section-panel">
      <div className="section-head">
        <div>
          <div className="section-kicker">Promotion</div>
          <h2 className="section-title">Promote accepted decisions</h2>
          <p className="section-copy">
            Only accepted, mapped, numeric candidates can move into the canonical measurement record.
          </p>
        </div>
        <span className="pill">{promotions.length} promotions</span>
      </div>

      {pendingAcceptedDecisions.length === 0 ? (
        <div className="detail-card">
          <div className="detail-label">No pending promotions</div>
          <p className="detail-copy">
            Accept, map, and verify a numeric parser candidate first, then it will appear here for promotion.
          </p>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="detail-label">Accepted review decision</span>
            <select value={selectedDecisionId} onChange={(event) => setSelectedDecisionId(event.target.value)}>
              {pendingAcceptedDecisions.map((decision) => (
                <option key={decision.id} value={decision.id}>
                  {decision.candidateDisplayName} to {decision.proposedCanonicalCode}
                </option>
              ))}
            </select>
          </label>

          {selectedDecision ? (
            <div className="detail-card" style={{ marginTop: 16 }}>
              <div className="detail-label">Promotion snapshot</div>
              <p className="detail-copy">
                {selectedDecision.candidateDisplayName} | {selectedDecision.candidateValueLabel}
              </p>
              <p className="summary-note">
                Proposed mapping: {selectedDecision.proposedTitle} | {selectedDecision.proposedCanonicalCode}
              </p>
            </div>
          ) : null}

          <div className="actions">
            <button className="button button-primary" disabled={isSubmitting} onClick={handleSubmit} type="button">
              {isSubmitting ? "Promoting..." : "Promote measurement"}
            </button>
            <button className="button button-secondary" onClick={resetDemo} type="button">
              Reset demo
            </button>
          </div>
        </>
      )}

      <div className="result-box">
        <pre>{result || "Promotion output will appear here."}</pre>
      </div>

      {promotions.length > 0 ? (
        <div className="detail-stack" style={{ marginTop: 16 }}>
          <div className="detail-label">Recent promotions</div>
          {promotions.slice(0, 4).map((promotion) => (
            <article className="detail-card" key={promotion.id}>
              <div className="signal-meta">
                <div>
                  <p className="signal-title">{promotion.title}</p>
                  <p className="summary-note">
                    {promotion.canonicalCode} | {formatDate(promotion.promotedAt)}
                  </p>
                </div>
                <span className="pill">{promotion.modality}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
