import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import { applySchemaAndSeed } from "./lib/postgres-admin.mjs";

const repoRoot = process.cwd();
const backend = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase() === "postgres" ? "postgres" : "file";
const storePath = path.join(repoRoot, "data", "store.json");
const uploadsPath = path.join(repoRoot, "data", "uploads");
const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const port = Number(process.env.SMOKE_PORT?.trim() || (backend === "postgres" ? "3131" : "3130"));
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Server did not become ready in time.");
}

async function listUploadFiles() {
  try {
    const entries = await readdir(uploadsPath);
    return entries.filter((entry) => entry !== ".gitkeep").sort();
  } catch {
    return [];
  }
}

function log(step, detail) {
  console.log(`[integration-smoke:${backend}] ${step}: ${detail}`);
}

async function createProbeZip(tempDir) {
  const zip = new JSZip();
  zip.file(
    "bundle.json",
    JSON.stringify({
      resourceType: "Bundle",
      type: "document",
      entry: [
        {
          resource: {
            resourceType: "Composition",
            title: "Smoke Test Lab Summary",
          },
        },
        {
          resource: {
            resourceType: "Observation",
            status: "final",
            code: {
              text: "ApoB",
              coding: [
                {
                  system: "http://loinc.org",
                  code: "1884-6",
                  display: "Apolipoprotein B",
                },
              ],
            },
            valueQuantity: {
              value: 78,
              unit: "mg/dL",
            },
            effectiveDateTime: "2026-04-01T08:00:00.000Z",
          },
        },
      ],
    }),
  );
  zip.file(
    "labs.csv",
    [
      "name,result,unit,loinc,observed_at",
      "ApoB,78,mg/dL,1884-6,2026-04-01T08:00:00.000Z",
      "C-Reactive Protein,1.1,mg/L,1988-5,2026-04-01T08:00:00.000Z",
    ].join("\n"),
  );
  zip.file("notes.txt", "Eight-week preventive review after sleep and training changes.");

  const zipBytes = await zip.generateAsync({ type: "nodebuffer" });
  const zipPath = path.join(tempDir, "integration-probe.zip");
  await writeFile(zipPath, zipBytes);
  return zipPath;
}

async function postMultipart(url, fields) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${JSON.stringify(json)}`);
  }

  return json;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${JSON.stringify(json)}`);
  }

  return json;
}

async function getPatientSnapshot() {
  const response = await fetch(`${baseUrl}/api/patients/pt_001`);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Patient fetch failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function prepareFileBackend(tempDir) {
  const backupPath = path.join(tempDir, "store.backup.json");
  const uploadsBefore = await listUploadFiles();
  await copyFile(storePath, backupPath);

  return async function cleanupFileBackend() {
    await copyFile(backupPath, storePath);

    const uploadsAfter = await listUploadFiles();
    const newUploads = uploadsAfter.filter((file) => !uploadsBefore.includes(file));
    await Promise.all(newUploads.map((file) => rm(path.join(uploadsPath, file), { force: true })));
  };
}

async function preparePostgresBackend() {
  if (process.env.SMOKE_ALLOW_DB_RESET !== "1") {
    throw new Error(
      "Refusing to reset Postgres state for smoke testing without SMOKE_ALLOW_DB_RESET=1.",
    );
  }

  await applySchemaAndSeed({ reset: true });

  return async function cleanupPostgresBackend() {
    await applySchemaAndSeed({ reset: true });
  };
}

async function prepareBackend(tempDir) {
  if (backend === "postgres") {
    return preparePostgresBackend();
  }

  return prepareFileBackend(tempDir);
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `longevity-smoke-${backend}-`));
  const cleanupBackend = await prepareBackend(tempDir);

  const server = spawn(process.execPath, [nextCli, "start", "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PERSISTENCE_BACKEND: backend,
    },
  });

  let stdout = "";
  let stderr = "";

  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();
    log("server", "ready");

    const before = await getPatientSnapshot();

    const report = await postJson(`${baseUrl}/api/intake/report`, {
      patientId: "pt_001",
      vendor: "Meta smoke longevity panel",
      observedAt: "2026-04-04T09:00:00.000Z",
      entries: [
        { name: "Biological Age", value: 45.2, unit: "years" },
        { name: "DunedinPACE", value: 0.91 },
        { name: "Mystery Marker", value: 12.3, unit: "arb" },
      ],
    });

    assert.equal(report.normalizationSummary.totalEntries, 3);
    assert.equal(report.normalizationSummary.mappedEntries, 2);
    assert.equal(report.normalizationSummary.unmappedEntries, 1);
    assert.equal(report.patientSnapshot.totalMeasurements, before.patient.measurements.length + 2);
    log("report-intake", `mapped ${report.normalizationSummary.mappedEntries} and left ${report.normalizationSummary.unmappedEntries} unmapped`);

    const afterReport = await getPatientSnapshot();
    assert.equal(afterReport.reportIngestions.length, before.reportIngestions.length + 1);
    assert.equal(afterReport.patient.measurements.length, before.patient.measurements.length + 2);
    assert.equal(afterReport.patient.timeline.length, before.patient.timeline.length + 1);

    const intervention = await postJson(`${baseUrl}/api/intake/intervention`, {
      patientId: "pt_001",
      title: "Meta smoke intervention",
      detail: "Added magnesium glycinate and tightened the sleep window.",
      occurredAt: "2026-04-05T19:30:00.000Z",
    });

    assert.equal(
      intervention.patientSnapshot.totalTimelineEvents,
      afterReport.patient.timeline.length + 1,
    );
    log("intervention-intake", "timeline advanced by one intervention event");

    const afterIntervention = await getPatientSnapshot();
    assert.equal(afterIntervention.patient.timeline.length, afterReport.patient.timeline.length + 1);

    const zipPath = await createProbeZip(tempDir);
    const zipBytes = await readFile(zipPath);

    const upload = await postMultipart(`${baseUrl}/api/intake/document`, {
      patientId: "pt_001",
      sourceSystem: "Integration smoke",
      file: new File([zipBytes], "integration-probe.zip", { type: "application/zip" }),
    });

    assert.equal(upload.document.classification, "zip_archive");
    assert.equal(upload.document.status, "archive_indexed");
    assert.equal(upload.extractedChildDocuments.length, 3);

    const parserNames = upload.parseTasks.map((task) => task.parser).sort();
    assert.deepEqual(parserNames, ["archive_manifest", "csv_table", "fhir_bundle", "text_note"]);
    log("document-intake", `created parsers ${parserNames.join(", ")}`);

    const csvTask = upload.parseTasks.find((task) => task.parser === "csv_table");
    assert.ok(csvTask, "csv_table task should exist");
    assert.ok(csvTask.candidates.length >= 1, "csv_table task should have candidates");

    const candidate = csvTask.candidates[0];
    const review = await postJson(`${baseUrl}/api/review/decision`, {
      patientId: "pt_001",
      parseTaskId: csvTask.id,
      candidateId: candidate.id,
      action: "accept",
      reviewerName: "Integration smoke clinician",
      proposedCanonicalCode: "apob",
      note: "Candidate is clean enough for promotion.",
    });

    assert.equal(review.decision.action, "accept");
    assert.equal(review.decision.proposedCanonicalCode, "apob");
    log("review", `accepted ${review.decision.candidateDisplayName}`);

    const promotion = await postJson(`${baseUrl}/api/review/promote`, {
      patientId: "pt_001",
      reviewDecisionId: review.decision.id,
    });

    assert.equal(promotion.measurement.canonicalCode, "apob");
    assert.equal(promotion.measurement.title, "ApoB");
    assert.equal(promotion.measurement.value, 78);
    log("promotion", `promoted ${promotion.measurement.title} ${promotion.measurement.value} ${promotion.measurement.unit}`);

    const after = await getPatientSnapshot();
    assert.equal(after.patient.measurements.length, before.patient.measurements.length + 3);
    assert.equal(after.patient.timeline.length, before.patient.timeline.length + 5);
    assert.equal(after.reportIngestions.length, before.reportIngestions.length + 1);
    assert.equal(after.sourceDocuments.length, before.sourceDocuments.length + 4);
    assert.equal(after.parseTasks.length, before.parseTasks.length + 4);
    assert.equal(after.reviewDecisions.length, before.reviewDecisions.length + 1);
    assert.equal(after.measurementPromotions.length, before.measurementPromotions.length + 1);
    log("verification", "all core routes changed state as expected");
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await cleanupBackend();
    await rm(tempDir, { recursive: true, force: true });

    if (server.exitCode !== 0 && server.exitCode !== null) {
      throw new Error(`Server exited with code ${server.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error(`[integration-smoke:${backend}] failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
