"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeReportEntries } from "@/src/lib/intake/report-entries";

const demoPayload = {
  patientId: "pt_001",
  vendor: "TruDiagnostic",
  observedAt: "2026-04-05T12:00:00.000Z",
  entries: [
    { name: "OMICmAge", value: 45.1, unit: "years" },
    { name: "DunedinPACE", value: 0.91 },
    { name: "CRP", value: 1.4, unit: "mg/L" },
    { name: "Unknown vendor score", value: 72 },
  ],
};

export function UploadWorkbench() {
  const router = useRouter();
  const [vendor, setVendor] = useState(demoPayload.vendor);
  const [payloadText, setPayloadText] = useState(JSON.stringify(demoPayload.entries, null, 2));
  const [result, setResult] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    try {
      let parsedEntries: unknown;

      try {
        parsedEntries = JSON.parse(payloadText) as unknown;
      } catch {
        setResult(JSON.stringify({ error: "Entries JSON must be valid JSON." }, null, 2));
        return;
      }

      if (!Array.isArray(parsedEntries)) {
        setResult(JSON.stringify({ error: "Entries JSON must be an array." }, null, 2));
        return;
      }

      const normalizedEntries = normalizeReportEntries(parsedEntries);
      if (!normalizedEntries.ok) {
        setResult(JSON.stringify({ error: normalizedEntries.error }, null, 2));
        return;
      }

      setIsSubmitting(true);
      setResult("");

      const response = await fetch("/api/intake/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: demoPayload.patientId,
          vendor,
          observedAt: demoPayload.observedAt,
          entries: normalizedEntries.entries,
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
    setVendor(demoPayload.vendor);
    setPayloadText(JSON.stringify(demoPayload.entries, null, 2));
    setResult("");
  }

  return (
    <section className="panel section-panel">
      <div className="section-head">
        <div>
          <div className="section-kicker">Workbench</div>
          <h2 className="section-title">Report intake and normalization</h2>
          <p className="section-copy">
            This is the first real backend seam: take source metrics, normalize what we understand, and preserve
            everything else for review.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <label className="field">
          <span className="detail-label">Vendor</span>
          <select
            disabled={isSubmitting}
            value={vendor}
            onChange={(event) => {
              setVendor(event.target.value);
              setResult("");
            }}
          >
            <option value="TruDiagnostic">TruDiagnostic</option>
            <option value="Hurdle">Hurdle</option>
            <option value="Quest panel via Terra parser">Quest panel via Terra parser</option>
          </select>
        </label>

        <label className="field">
          <span className="detail-label">Patient</span>
          <input readOnly value={demoPayload.patientId} />
        </label>
      </div>

      <label className="field" style={{ marginTop: 16 }}>
        <span className="detail-label">Entries JSON</span>
        <textarea
          disabled={isSubmitting}
          value={payloadText}
          onChange={(event) => {
            setPayloadText(event.target.value);
            setResult("");
          }}
        />
        <p className="field-note">
          Keep this intentionally simple for v1. Upload UI and vendor-specific parsers can sit on top later.
        </p>
      </label>

      <div className="actions">
        <button className="button button-primary" disabled={isSubmitting} onClick={handleSubmit} type="button">
          {isSubmitting ? "Normalizing..." : "Run normalization"}
        </button>
        <button className="button button-secondary" disabled={isSubmitting} onClick={resetDemo} type="button">
          Reset demo
        </button>
      </div>

      <div className="result-box">
        <pre>{result || "Normalization output will appear here."}</pre>
      </div>
    </section>
  );
}
