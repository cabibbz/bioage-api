"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SelectedFileState = {
  file: File;
  preview: string;
};

const demoSourceSystem = "Manual clinic upload";

export function DocumentUploadWorkbench() {
  const router = useRouter();
  const [sourceSystem, setSourceSystem] = useState(demoSourceSystem);
  const [selectedFile, setSelectedFile] = useState<SelectedFileState | null>(null);
  const [fileInputResetKey, setFileInputResetKey] = useState(0);
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const acceptedTypes = useMemo(
    () => ".pdf,.png,.jpg,.jpeg,.json,.zip,.xml,.html,.htm,.csv,.xls,.xlsx,.txt",
    [],
  );

  async function handleSubmit() {
    if (!selectedFile) {
      setResult(JSON.stringify({ error: "Choose a file first." }, null, 2));
      return;
    }

    if (!sourceSystem.trim()) {
      setResult(JSON.stringify({ error: "Choose a source system first." }, null, 2));
      return;
    }

    setIsSubmitting(true);
    setResult("");

    try {
      const formData = new FormData();
      formData.set("patientId", "pt_001");
      formData.set("sourceSystem", sourceSystem.trim());
      formData.set("file", selectedFile.file);

      const response = await fetch("/api/intake/document", {
        method: "POST",
        body: formData,
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

  function handleFileChange(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    setSelectedFile({
      file,
      preview: `${file.name} | ${file.type || "unknown mime"} | ${file.size} bytes`,
    });
  }

  function resetDemo() {
    setSourceSystem(demoSourceSystem);
    setSelectedFile(null);
    setFileInputResetKey((current) => current + 1);
    setResult("");
  }

  return (
    <section className="panel section-panel">
      <div className="section-head">
        <div>
          <div className="section-kicker">Source Documents</div>
          <h2 className="section-title">Upload a source file</h2>
          <p className="section-copy">
            This route stores the original file, fingerprints it, classifies the envelope, and creates parser tasks
            without pretending every file has already been clinically parsed.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <label className="field">
          <span className="detail-label">Source system</span>
          <input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} />
        </label>

        <label className="field">
          <span className="detail-label">Patient</span>
          <input readOnly value="pt_001" />
        </label>
      </div>

      <label className="field" style={{ marginTop: 16 }}>
        <span className="detail-label">File</span>
        <input
          accept={acceptedTypes}
          key={fileInputResetKey}
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          type="file"
        />
        <p className="field-note">
          {selectedFile?.preview ?? "Choose a PDF, image, JSON, XML, CSV, XLS/XLSX, TXT, HTML, or ZIP file."}
        </p>
      </label>

      <div className="actions">
        <button className="button button-primary" disabled={isSubmitting} onClick={handleSubmit} type="button">
          {isSubmitting ? "Uploading..." : "Store source document"}
        </button>
        <button className="button button-secondary" onClick={resetDemo} type="button">
          Reset
        </button>
      </div>

      <div className="result-box">
        <pre>{result || "Document intake output will appear here."}</pre>
      </div>
    </section>
  );
}
