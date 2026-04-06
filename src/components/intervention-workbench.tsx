"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

const demoIntervention = {
  patientId: "pt_001",
  title: "Omega-3 dose increased",
  detail: "Raised EPA/DHA intake and paired with repeat inflammation review in 60 days.",
  occurredAt: "2026-04-04T09:00:00.000Z",
};

export function InterventionWorkbench() {
  const router = useRouter();
  const [title, setTitle] = useState(demoIntervention.title);
  const [detail, setDetail] = useState(demoIntervention.detail);
  const [occurredAt, setOccurredAt] = useState("2026-04-04");
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    try {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        setResult(JSON.stringify({ error: "Title is required." }, null, 2));
        return;
      }

      const normalizedDetail = detail.trim();
      if (!normalizedDetail) {
        setResult(JSON.stringify({ error: "Detail is required." }, null, 2));
        return;
      }

      if (!occurredAt) {
        setResult(JSON.stringify({ error: "Choose a valid date first." }, null, 2));
        return;
      }

      const occurredAtDate = new Date(`${occurredAt}T09:00:00.000Z`);
      if (Number.isNaN(occurredAtDate.getTime())) {
        setResult(JSON.stringify({ error: "Choose a valid date first." }, null, 2));
        return;
      }

      setIsSubmitting(true);
      setResult("");

      const response = await fetch("/api/intake/intervention", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: demoIntervention.patientId,
          title: normalizedTitle,
          detail: normalizedDetail,
          occurredAt: occurredAtDate.toISOString(),
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
    setTitle(demoIntervention.title);
    setDetail(demoIntervention.detail);
    setOccurredAt("2026-04-04");
    setResult("");
  }

  return (
    <section className="panel section-panel">
      <div className="section-head">
        <div>
          <div className="section-kicker">Interventions</div>
          <h2 className="section-title">Tag a protocol change</h2>
          <p className="section-copy">
            The timeline matters only if clinicians can mark what changed between measurements.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <label className="field">
          <span className="detail-label">Title</span>
          <input
            disabled={isSubmitting}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setResult("");
            }}
          />
        </label>

        <label className="field">
          <span className="detail-label">Date</span>
          <input
            disabled={isSubmitting}
            type="date"
            value={occurredAt}
            onChange={(event) => {
              setOccurredAt(event.target.value);
              setResult("");
            }}
          />
        </label>
      </div>

      <label className="field" style={{ marginTop: 16 }}>
        <span className="detail-label">Detail</span>
        <textarea
          disabled={isSubmitting}
          value={detail}
          onChange={(event) => {
            setDetail(event.target.value);
            setResult("");
          }}
        />
      </label>

      <div className="actions">
        <button className="button button-primary" disabled={isSubmitting} onClick={handleSubmit} type="button">
          {isSubmitting ? "Saving..." : "Save intervention"}
        </button>
        <button className="button button-secondary" disabled={isSubmitting} onClick={resetDemo} type="button">
          Reset demo
        </button>
      </div>

      <div className="result-box">
        <pre>{result || "Intervention save output will appear here."}</pre>
      </div>
    </section>
  );
}
