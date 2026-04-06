import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readdir, rm, copyFile, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import { applySchemaAndSeed } from "./lib/postgres-admin.mjs";
import { resolveCanonicalCodeForName } from "./lib/canonical-catalog.mjs";
import { loadPersistedPatientSnapshot } from "./lib/persisted-patient-snapshot.mjs";

const repoRoot = process.cwd();
const backend = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase() === "postgres" ? "postgres" : "file";
const patientId = process.env.FUNCTIONAL_TEST_PATIENT_ID?.trim() || "pt_001";
const storePath = path.join(repoRoot, "data", "store.json");
const uploadsPath = path.join(repoRoot, "data", "uploads");
const apiRoutesPath = path.join(repoRoot, "app", "api");
const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const parserContractPath = path.join(repoRoot, "src", "lib", "parsing", "parser-contract.json");
const port = Number(
  process.env.FUNCTIONAL_PORT?.trim() ||
    process.env.SMOKE_PORT?.trim() ||
    (backend === "postgres" ? "3141" : "3140"),
);
const baseUrl = `http://127.0.0.1:${port}`;
const parserContract = JSON.parse(await readFile(parserContractPath, "utf8"));

function log(step, detail) {
  console.log(`[functional-tests:${backend}] ${step}: ${detail}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    let killRequested = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(forceKillTimeout);
      clearTimeout(giveUpTimeout);
      resolve(undefined);
    };

    const forceKillTimeout = setTimeout(() => {
      killRequested = true;
      server.kill("SIGKILL");
    }, 5000);

    const giveUpTimeout = setTimeout(() => {
      finish();
    }, 10000);

    server.once("exit", () => {
      finish();
    });

    if (!killRequested) {
      server.kill("SIGTERM");
    }
  });
}

function extensionOf(filename) {
  return path.extname(filename).toLowerCase();
}

function normalizePathSeparators(value) {
  return value.replaceAll("\\", "/");
}

function resolveParserForClassification(classification, filename) {
  const contract = parserContract.classifications[classification];
  assert.ok(contract, `No parser contract exists for classification ${classification}`);

  const extension = extensionOf(filename);
  if (contract.extensionParsers?.[extension]) {
    return contract.extensionParsers[extension];
  }

  if (contract.parser) {
    return contract.parser;
  }

  if (contract.defaultParser) {
    return contract.defaultParser;
  }

  throw new Error(`Parser contract for classification ${classification} is incomplete.`);
}

function resolveModeForParser(parser) {
  const definition = parserContract.parsers[parser];
  assert.ok(definition, `No parser definition exists for parser ${parser}`);
  return definition.mode;
}

async function collectApiRouteFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const routeFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routeFiles.push(...(await collectApiRouteFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      routeFiles.push(entryPath);
    }
  }

  return routeFiles;
}

function routePathFromFile(routeFilePath) {
  const relativeDirectory = normalizePathSeparators(path.relative(apiRoutesPath, path.dirname(routeFilePath)));
  return relativeDirectory ? `/api/${relativeDirectory}` : "/api";
}

async function discoverApiRouteMethods() {
  const routeFiles = (await collectApiRouteFiles(apiRoutesPath)).sort();
  const discoveredRouteMethods = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    const methods = new Set();

    for (const pattern of [
      /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g,
      /\bexport\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g,
    ]) {
      for (const match of source.matchAll(pattern)) {
        methods.add(match[1]);
      }
    }

    assert.ok(methods.size > 0, `No route methods were discovered in ${normalizePathSeparators(path.relative(repoRoot, routeFile))}.`);

    const routePath = routePathFromFile(routeFile);
    for (const method of [...methods].sort()) {
      discoveredRouteMethods.push(`${method} ${routePath}`);
    }
  }

  return discoveredRouteMethods.sort();
}

function countSnapshot(snapshot) {
  return {
    measurements: snapshot.patient.measurements.length,
    timeline: snapshot.patient.timeline.length,
    reportIngestions: snapshot.reportIngestions.length,
    sourceDocuments: snapshot.sourceDocuments.length,
    parseTasks: snapshot.parseTasks.length,
    reviewDecisions: snapshot.reviewDecisions.length,
    measurementPromotions: snapshot.measurementPromotions.length,
  };
}

function sortNormalizedList(entries) {
  return [...entries].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function candidateHasPromotableValue(candidate) {
  return candidate.numericValue !== undefined || Boolean(candidate.textValue?.trim());
}

function normalizeCandidates(candidates) {
  return sortNormalizedList(
    candidates.map((candidate) => ({
      sourcePath: candidate.sourcePath,
      displayName: candidate.displayName,
      valueLabel: candidate.valueLabel,
      numericValue: candidate.numericValue ?? null,
      textValue: candidate.textValue ?? null,
      unit: candidate.unit ?? null,
      loincCode: candidate.loincCode ?? null,
      observedAt: candidate.observedAt ?? null,
      referenceRange: candidate.referenceRange ?? null,
    })),
  );
}

function normalizeSnapshotForParity(snapshot) {
  return {
    patient: {
      displayName: snapshot.patient.displayName,
      chronologicalAge: snapshot.patient.chronologicalAge,
      focus: snapshot.patient.focus,
      measurements: sortNormalizedList(
        snapshot.patient.measurements.map((measurement) => ({
          title: measurement.title,
          canonicalCode: measurement.canonicalCode,
          modality: measurement.modality,
          sourceVendor: measurement.sourceVendor,
          observedAt: measurement.observedAt,
          value: measurement.value ?? null,
          textValue: measurement.textValue ?? null,
          unit: measurement.unit ?? null,
          interpretation: measurement.interpretation,
          evidenceStatus: measurement.evidenceStatus,
          confidenceLabel: measurement.confidenceLabel,
          deltaLabel: measurement.deltaLabel ?? null,
        })),
      ),
      timeline: sortNormalizedList(
        snapshot.patient.timeline.map((event) => ({
          type: event.type,
          title: event.title,
          detail: event.detail,
        })),
      ),
    },
    reportIngestions: sortNormalizedList(
      snapshot.reportIngestions.map((ingestion) => ({
        vendor: ingestion.vendor,
        observedAt: ingestion.observedAt,
        mappedMeasurements: sortNormalizedList(
          ingestion.mappedMeasurements.map((measurement) => ({
            canonicalCode: measurement.canonicalCode,
            title: measurement.title,
            modality: measurement.modality,
            sourceVendor: measurement.sourceVendor,
            sourceField: measurement.sourceField,
            value: measurement.value ?? null,
            textValue: measurement.textValue ?? null,
            unit: measurement.unit ?? null,
            observedAt: measurement.observedAt,
            confidence: measurement.confidence,
            note: measurement.note,
          })),
        ),
        unmappedEntries: sortNormalizedList(
          ingestion.unmappedEntries.map((entry) => ({
            sourceField: entry.sourceField,
            value: entry.value ?? null,
            textValue: entry.textValue ?? null,
            unit: entry.unit ?? null,
          })),
        ),
      })),
    ),
    sourceDocuments: sortNormalizedList(
      snapshot.sourceDocuments.map((document) => ({
        sourceSystem: document.sourceSystem,
        ingestionChannel: document.ingestionChannel,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        byteSize: document.byteSize,
        checksumSha256: document.checksumSha256,
        classification: document.classification,
        status: document.status,
        observedAt: document.observedAt ?? null,
        archiveEntryPath: document.archiveEntryPath ?? null,
        hasParentDocument: Boolean(document.parentDocumentId),
        archiveEntries: sortNormalizedList(
          (document.archiveEntries ?? []).map((entry) => ({
            path: entry.path,
            isDirectory: entry.isDirectory,
            classification: entry.classification,
          })),
        ),
      })),
    ),
    parseTasks: sortNormalizedList(
      snapshot.parseTasks.map((task) => ({
        sourceDocumentFilename: task.sourceDocumentFilename,
        sourceDocumentClassification: task.sourceDocumentClassification,
        mode: task.mode,
        parser: task.parser,
        status: task.status,
        summary: task.summary,
        detail: task.detail,
        candidateCount: task.candidateCount,
        metadata: sortNormalizedList(task.metadata),
        candidates: normalizeCandidates(task.candidates),
        errorMessage: task.errorMessage ?? null,
      })),
    ),
    reviewDecisions: sortNormalizedList(
      snapshot.reviewDecisions.map((decision) => ({
        candidateDisplayName: decision.candidateDisplayName,
        candidateValueLabel: decision.candidateValueLabel,
        candidateSourcePath: decision.candidateSourcePath,
        action: decision.action,
        reviewerName: decision.reviewerName,
        note: decision.note ?? null,
        proposedCanonicalCode: decision.proposedCanonicalCode ?? null,
        proposedTitle: decision.proposedTitle ?? null,
        proposedModality: decision.proposedModality ?? null,
      })),
    ),
    measurementPromotions: sortNormalizedList(
      snapshot.measurementPromotions.map((promotion) => ({
        canonicalCode: promotion.canonicalCode,
        title: promotion.title,
        modality: promotion.modality,
      })),
    ),
  };
}

async function assertSnapshotInvariants(snapshot) {
  const documentById = new Map(snapshot.sourceDocuments.map((document) => [document.id, document]));
  const taskById = new Map(snapshot.parseTasks.map((task) => [task.id, task]));
  const decisionById = new Map(snapshot.reviewDecisions.map((decision) => [decision.id, decision]));
  const measurementById = new Map(snapshot.patient.measurements.map((measurement) => [measurement.id, measurement]));

  snapshot.sourceDocuments.forEach((document) => {
    if (document.parentDocumentId) {
      assert.ok(
        documentById.has(document.parentDocumentId),
        `Parent document ${document.parentDocumentId} should exist for ${document.id}`,
      );
    }
  });

  snapshot.parseTasks.forEach((task) => {
    const sourceDocument = documentById.get(task.sourceDocumentId);
    assert.ok(sourceDocument, `Source document ${task.sourceDocumentId} should exist for parse task ${task.id}`);
    assert.equal(task.sourceDocumentFilename, sourceDocument.originalFilename);
    assert.equal(task.sourceDocumentClassification, sourceDocument.classification);
    assert.equal(task.candidateCount, task.candidates.length);
  });

  snapshot.reviewDecisions.forEach((decision) => {
    const task = taskById.get(decision.parseTaskId);
    assert.ok(task, `Parse task ${decision.parseTaskId} should exist for review decision ${decision.id}`);
    assert.ok(
      documentById.has(decision.sourceDocumentId),
      `Source document ${decision.sourceDocumentId} should exist for review decision ${decision.id}`,
    );
    assert.ok(
      task.candidates.some((candidate) => candidate.id === decision.candidateId),
      `Candidate ${decision.candidateId} should exist on parse task ${decision.parseTaskId}`,
    );
  });

  snapshot.measurementPromotions.forEach((promotion) => {
    const decision = decisionById.get(promotion.reviewDecisionId);
    assert.ok(
      decision,
      `Review decision ${promotion.reviewDecisionId} should exist for promotion ${promotion.id}`,
    );
    assert.ok(taskById.has(promotion.parseTaskId), `Parse task ${promotion.parseTaskId} should exist for promotion ${promotion.id}`);
    assert.ok(
      documentById.has(promotion.sourceDocumentId),
      `Source document ${promotion.sourceDocumentId} should exist for promotion ${promotion.id}`,
    );
    const measurement = measurementById.get(promotion.measurementId);
    assert.ok(
      measurement,
      `Measurement ${promotion.measurementId} should exist for promotion ${promotion.id}`,
    );
    assert.equal(measurement.canonicalCode, promotion.canonicalCode);
    assert.equal(measurement.title, promotion.title);
    assert.equal(measurement.modality, promotion.modality);
    assert.equal(decision.parseTaskId, promotion.parseTaskId);
    assert.equal(decision.sourceDocumentId, promotion.sourceDocumentId);
  });

  await Promise.all(
    snapshot.sourceDocuments
      .filter((document) => document.storageBackend === "local_fs")
      .map(async (document) => {
        const absolutePath = path.resolve(repoRoot, document.relativePath);
        const bytes = await readFile(absolutePath);
        assert.equal(
          bytes.length,
          document.byteSize,
          `Stored byte length should match metadata for document ${document.id}`,
        );
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          document.checksumSha256,
          `Stored checksum should match metadata for document ${document.id}`,
        );
        assert.equal(
          document.relativePath,
          `data/${document.storageKey}`,
          `Relative path should align with storage key for document ${document.id}`,
        );
      }),
  );
}

function assertCountDelta(before, after, expected) {
  for (const [key, delta] of Object.entries(expected)) {
    assert.equal(after[key], before[key] + delta, `${key} should change by ${delta}`);
  }
}

function assertTaskShape(task) {
  assert.ok(task.id);
  assert.equal(task.candidateCount, task.candidates.length);
  assert.ok(typeof task.summary === "string" && task.summary.length > 0);
  assert.ok(typeof task.detail === "string" && task.detail.length > 0);
}

function assertDocumentStatusMatchesTask(document, task) {
  if (document.classification === "zip_archive") {
    assert.equal(document.status, "archive_indexed");
    return;
  }

  if (task.status === "completed") {
    assert.equal(document.status, "parsed_summary_ready");
    return;
  }

  if (task.status === "needs_review") {
    assert.equal(document.status, "needs_review");
    return;
  }

  if (task.status === "failed") {
    assert.equal(document.status, "parse_failed");
    return;
  }

  assert.equal(document.status, "pending_parse");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/patients/${patientId}`);
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

async function resetUploads(baselineUploads) {
  const currentUploads = await listUploadFiles();
  const staleUploads = currentUploads.filter((file) => !baselineUploads.includes(file));
  await Promise.all(staleUploads.map((file) => rm(path.join(uploadsPath, file), { force: true })));
}

async function prepareFileBackend(tempDir, baselineUploads) {
  const backupPath = path.join(tempDir, "store.backup.json");
  await copyFile(storePath, backupPath);
  await resetUploads(baselineUploads);

  return {
    async reset() {
      await copyFile(backupPath, storePath);
      await resetUploads(baselineUploads);
    },
    async cleanup() {
      await copyFile(backupPath, storePath);
      await resetUploads(baselineUploads);
    },
  };
}

async function preparePostgresBackend(baselineUploads) {
  if (process.env.FUNCTIONAL_ALLOW_DB_RESET !== "1" && process.env.SMOKE_ALLOW_DB_RESET !== "1") {
    throw new Error(
      "Refusing to reset Postgres state for functional testing without FUNCTIONAL_ALLOW_DB_RESET=1.",
    );
  }

  await applySchemaAndSeed({ reset: true });
  await resetUploads(baselineUploads);

  return {
    async reset() {
      await applySchemaAndSeed({ reset: true });
      await resetUploads(baselineUploads);
    },
    async cleanup() {
      await applySchemaAndSeed({ reset: true });
      await resetUploads(baselineUploads);
    },
  };
}

async function prepareBackend(tempDir, baselineUploads) {
  if (backend === "postgres") {
    return preparePostgresBackend(baselineUploads);
  }

  return prepareFileBackend(tempDir, baselineUploads);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { response, json };
}

async function getPersistedPatientSnapshot(targetPatientId = patientId) {
  return loadPersistedPatientSnapshot({
    backend,
    patientId: targetPatientId,
    repoRoot,
  });
}

async function expectJson(url, options, expectedStatus) {
  const result = await requestJson(url, options);
  assert.equal(result.response.status, expectedStatus, `${url} should return ${expectedStatus}`);
  return result.json;
}

async function assertPatientSnapshotResponseContract(result, targetPatientId) {
  if (!result?.patientSnapshot || typeof targetPatientId !== "string") {
    return result;
  }

  const snapshot = await getPersistedPatientSnapshot(targetPatientId);
  assert.ok(snapshot, `Persisted patient ${targetPatientId} should exist when patientSnapshot is returned.`);
  assert.equal(result.patientSnapshot.lastReviewedAt, snapshot.patient.lastReviewedAt);

  if ("totalMeasurements" in result.patientSnapshot) {
    assert.equal(result.patientSnapshot.totalMeasurements, snapshot.patient.measurements.length);
  }

  if ("totalTimelineEvents" in result.patientSnapshot) {
    assert.equal(result.patientSnapshot.totalTimelineEvents, snapshot.patient.timeline.length);
  }

  return result;
}

async function postJson(pathname, payload, expectedStatus = 200) {
  const result = await expectJson(
    `${baseUrl}${pathname}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    expectedStatus,
  );

  if (expectedStatus >= 400) {
    return result;
  }

  return assertPatientSnapshotResponseContract(result, payload?.patientId);
}

async function postRawJson(pathname, body, expectedStatus) {
  return expectJson(
    `${baseUrl}${pathname}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    },
    expectedStatus,
  );
}

async function postMultipart(pathname, fields, expectedStatus = 200) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof File) {
      form.set(key, value, value.name);
    } else {
      form.set(key, value);
    }
  }

  const result = await expectJson(
    `${baseUrl}${pathname}`,
    {
      method: "POST",
      body: form,
    },
    expectedStatus,
  );

  if (expectedStatus >= 400) {
    return result;
  }

  return assertPatientSnapshotResponseContract(result, fields?.patientId);
}

async function getPatientSnapshot(targetPatientId = patientId, expectedStatus = 200) {
  return expectJson(`${baseUrl}/api/patients/${targetPatientId}`, {}, expectedStatus);
}

function createNumericFhirBundle() {
  return Buffer.from(
    JSON.stringify({
      resourceType: "Bundle",
      type: "document",
      entry: [
        {
          resource: {
            resourceType: "Composition",
            title: "Functional Test Lab Summary",
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
        {
          resource: {
            resourceType: "Observation",
            status: "final",
            code: {
              text: "C-Reactive Protein",
            },
            valueQuantity: {
              value: 1.1,
              unit: "mg/L",
            },
            effectiveDateTime: "2026-04-01T08:00:00.000Z",
          },
        },
      ],
    }),
  );
}

function createNumericFhirResource() {
  return Buffer.from(
    JSON.stringify({
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
        value: 81,
        unit: "mg/dL",
      },
      effectiveDateTime: "2026-04-02T09:00:00.000Z",
    }),
  );
}

function createTextFhirResource() {
  return Buffer.from(
    JSON.stringify({
      resourceType: "Observation",
      status: "final",
      code: {
        text: "ApoB interpretation",
      },
      valueString: "borderline high",
      effectiveDateTime: "2026-04-03T09:00:00.000Z",
    }),
  );
}

function createGenericJsonFixture() {
  return Buffer.from(
    JSON.stringify({
      vendor: "functional-json",
      labs: [
        {
          name: "ApoB",
          result: 76,
          unit: "mg/dL",
          loinc: "1884-6",
          observed_at: "2026-04-01T08:00:00.000Z",
        },
        {
          biomarker: "C-Reactive Protein",
          measurement: "1.4",
          units: "mg/L",
          timestamp: "2026-04-01T08:00:00.000Z",
        },
      ],
    }),
  );
}

function createBrokenJsonFixture() {
  return Buffer.from('{"vendor":"broken-json","labs":[{"name":"ApoB","result":78}');
}

function createCsvFixture() {
  return Buffer.from(
    [
      "name,result,unit,loinc,observed_at",
      "ApoB,78,mg/dL,1884-6,2026-04-01T08:00:00.000Z",
      "C-Reactive Protein,1.1,mg/L,1988-5,2026-04-01T08:00:00.000Z",
    ].join("\n"),
  );
}

function createCcdaFixture() {
  return Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<ClinicalDocument>",
      "<title>Preventive Lab Summary</title>",
      '<effectiveTime value="20260401080000"/>',
      "<section><title>Results</title><text>Summary only</text></section>",
      "<section><title>Plan</title><text>Retest in 8 weeks</text></section>",
      "</ClinicalDocument>",
    ].join(""),
  );
}

function createHtmlFixture() {
  return Buffer.from("<html><body><h1>Vendor export</h1><p>Review-first HTML document.</p></body></html>");
}

function createTextFixture() {
  return Buffer.from("Eight-week preventive review after sleep and training changes.");
}

function createPdfFixture() {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
}

function createSpreadsheetFixture() {
  return Buffer.from("PK functional xlsx placeholder");
}

function createImageFixture() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function createUnknownFixture() {
  return Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
}

const deterministicZipDate = new Date("2026-01-01T00:00:00.000Z");

async function createArchiveFixture() {
  const zip = new JSZip();
  zip.file("bundle.json", createNumericFhirBundle(), { date: deterministicZipDate });
  zip.file("labs.csv", createCsvFixture(), { date: deterministicZipDate });
  zip.file("notes.txt", createTextFixture(), { date: deterministicZipDate });

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "DOS",
  });
}

const documentScenarios = [
  {
    name: "fhir-bundle",
    filename: "functional-bundle.json",
    mimeType: "application/json",
    expectedClassification: "fhir_bundle",
    minCandidates: 2,
    buildBytes: async () => createNumericFhirBundle(),
  },
  {
    name: "fhir-resource",
    filename: "functional-observation.json",
    mimeType: "application/json",
    expectedClassification: "fhir_resource",
    minCandidates: 1,
    buildBytes: async () => createNumericFhirResource(),
  },
  {
    name: "generic-json",
    filename: "functional-generic.json",
    mimeType: "application/json",
    expectedClassification: "json_payload",
    minCandidates: 2,
    buildBytes: async () => createGenericJsonFixture(),
  },
  {
    name: "csv",
    filename: "functional-labs.csv",
    mimeType: "text/csv",
    expectedClassification: "spreadsheet",
    minCandidates: 2,
    buildBytes: async () => createCsvFixture(),
  },
  {
    name: "text-note",
    filename: "functional-note.txt",
    mimeType: "text/plain",
    expectedClassification: "text_note",
    minCandidates: 0,
    buildBytes: async () => createTextFixture(),
  },
  {
    name: "ccda",
    filename: "functional-ccda.xml",
    mimeType: "application/xml",
    expectedClassification: "ccda_xml",
    minCandidates: 0,
    buildBytes: async () => createCcdaFixture(),
  },
  {
    name: "pdf-review",
    filename: "functional-report.pdf",
    mimeType: "application/pdf",
    expectedClassification: "pdf_report",
    minCandidates: 0,
    buildBytes: async () => createPdfFixture(),
  },
  {
    name: "image-review",
    filename: "functional-scan.png",
    mimeType: "image/png",
    expectedClassification: "image_report",
    minCandidates: 0,
    buildBytes: async () => createImageFixture(),
  },
  {
    name: "html-review",
    filename: "functional-export.html",
    mimeType: "text/html",
    expectedClassification: "html_export",
    minCandidates: 0,
    buildBytes: async () => createHtmlFixture(),
  },
  {
    name: "spreadsheet-review",
    filename: "functional-sheet.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    expectedClassification: "spreadsheet",
    minCandidates: 0,
    buildBytes: async () => createSpreadsheetFixture(),
  },
  {
    name: "unknown-review",
    filename: "functional-source.bin",
    mimeType: "application/octet-stream",
    expectedClassification: "unknown",
    minCandidates: 0,
    buildBytes: async () => createUnknownFixture(),
  },
  {
    name: "archive-matrix",
    filename: "functional-archive.zip",
    mimeType: "application/zip",
    expectedClassification: "zip_archive",
    minCandidates: 0,
    childScenarioNames: ["fhir-bundle", "csv", "text-note"],
    buildBytes: createArchiveFixture,
  },
];

async function uploadDocumentFixture(fixture) {
  const bytes = await fixture.buildBytes();
  const file = new File([bytes], fixture.filename, { type: fixture.mimeType });

  return postMultipart("/api/intake/document", {
    patientId,
    sourceSystem: `Functional ${fixture.name}`,
    observedAt: "2026-04-05T10:00:00.000Z",
    file,
  });
}

function findReviewableCandidate(parseTasks, predicate) {
  for (const task of parseTasks) {
    const candidate = task.candidates.find(predicate);
    if (candidate) {
      return { task, candidate };
    }
  }

  return null;
}

function findPromotableReviewTarget(parseTasks) {
  for (const task of parseTasks) {
    const candidate = task.candidates.find(
      (entry) => entry.numericValue !== undefined && Boolean(resolveCanonicalCodeForName(entry.displayName)),
    );
    if (candidate) {
      return {
        task,
        candidate,
        proposedCanonicalCode: resolveCanonicalCodeForName(candidate.displayName),
      };
    }
  }

  return null;
}

function requireDocumentScenario(name) {
  const fixture = documentScenarios.find((entry) => entry.name === name);
  assert.ok(fixture, `Document scenario ${name} should exist`);
  return fixture;
}

function expectedParserForFixture(fixture) {
  return resolveParserForClassification(fixture.expectedClassification, fixture.filename);
}

function expectedModeForFixture(fixture) {
  return resolveModeForParser(expectedParserForFixture(fixture));
}

function expectedStatusForFixture(fixture) {
  return expectedModeForFixture(fixture) === "review" ? "needs_review" : "completed";
}

function assertParserContractCoverage() {
  const coveredClassifications = [...new Set(documentScenarios.map((fixture) => fixture.expectedClassification))].sort();
  const declaredClassifications = Object.keys(parserContract.classifications).sort();
  assert.deepEqual(
    coveredClassifications,
    declaredClassifications,
    "Document fixtures must cover every declared source-document classification.",
  );

  const coveredParsers = [...new Set(documentScenarios.map((fixture) => expectedParserForFixture(fixture)))].sort();
  const declaredParsers = Object.keys(parserContract.parsers).sort();
  assert.deepEqual(
    coveredParsers,
    declaredParsers,
    "Document fixtures must cover every declared parser.",
  );
}

assertParserContractCoverage();

async function runScenario(name, backendController, run) {
  log("scenario", `starting ${name}`);
  await backendController.reset();
  await run();
  const apiSnapshot = await getPatientSnapshot();
  const persistedSnapshot = await getPersistedPatientSnapshot();
  assert.ok(persistedSnapshot, `Persisted patient ${patientId} should exist after scenario ${name}.`);
  assert.deepEqual(
    apiSnapshot,
    persistedSnapshot,
    `GET /api/patients/[patientId] must match persisted backend state after scenario ${name}.`,
  );
  await assertSnapshotInvariants(persistedSnapshot);
  log("scenario", `passed ${name}`);
  return {
    name,
    state: normalizeSnapshotForParity(persistedSnapshot),
  };
}

const scenarios = [
  {
    name: "patient-route-contract",
    covers: ["GET /api/patients/[patientId]"],
    coverageType: "mixed",
    async run() {
      const snapshot = await getPatientSnapshot();
      const persistedSnapshot = await getPersistedPatientSnapshot();
      assert.ok(persistedSnapshot);
      assert.deepEqual(snapshot, persistedSnapshot);

      const missing = await getPatientSnapshot("pt_missing", 404);
      assert.equal(missing.error, "Patient not found.");
      const missingPersisted = await getPersistedPatientSnapshot("pt_missing");
      assert.equal(missingPersisted, null);
    },
  },
  {
    name: "report-intake-validation",
    covers: ["POST /api/intake/report"],
    coverageType: "error",
    async run() {
      const invalidJson = await postRawJson("/api/intake/report", "{", 400);
      assert.equal(invalidJson.error, "Request body must be valid JSON.");

      const missingFields = await postJson("/api/intake/report", { patientId }, 400);
      assert.equal(missingFields.error, "patientId and vendor are required.");

      const blankFields = await postJson(
        "/api/intake/report",
        { patientId: "   ", vendor: "   ", entries: [] },
        400,
      );
      assert.equal(blankFields.error, "patientId and vendor are required.");

      const invalidEntries = await postJson(
        "/api/intake/report",
        { patientId, vendor: "Functional", entries: "not-an-array" },
        400,
      );
      assert.equal(invalidEntries.error, "entries must be an array.");

      const malformedEntry = await postJson(
        "/api/intake/report",
        {
          patientId,
          vendor: "Functional",
          entries: [{ name: "Broken Entry", value: "not-a-number" }],
        },
        400,
      );
      assert.equal(
        malformedEntry.error,
        "Each entry must include a non-empty string name plus either numeric value or non-empty textValue.",
      );

      const invalidObservedAt = await postJson(
        "/api/intake/report",
        {
          patientId,
          vendor: "Functional",
          observedAt: "not-a-timestamp",
          entries: [],
        },
        400,
      );
      assert.equal(invalidObservedAt.error, "observedAt must be a valid ISO-8601 timestamp.");
    },
  },
  {
    name: "report-intake-state-transition",
    covers: ["POST /api/intake/report"],
    coverageType: "success",
    async run() {
      const before = await getPatientSnapshot();
      const report = await postJson("/api/intake/report", {
        patientId,
        vendor: "Functional longevity panel",
        observedAt: "2026-04-04T09:00:00.000Z",
        entries: [
          { name: "Index biological age", value: 45.2, unit: "years" },
          { name: "OMICm FitAge", value: 42.7, unit: "years" },
          { name: "Apolipoprotein B", value: 78, unit: "mg/dL" },
          { name: "LDL-C", value: 81, unit: "mg/dL" },
          { name: "HbA1c", value: 34, unit: "mmol/mol" },
          { name: "CRP", textValue: "<0.3", unit: "mg/L" },
          { name: "Lp(a)", value: 28, unit: "mg/dL" },
          { name: "Vitamin D, 25-Hydroxy", value: 54, unit: "ng/mL" },
          { name: "Mystery Marker", value: 12.3, unit: "arb" },
        ],
      });

      assert.equal(report.normalizationSummary.totalEntries, 9);
      assert.equal(report.normalizationSummary.mappedEntries, report.measurements.length);
      assert.equal(report.normalizationSummary.unmappedEntries, report.unmappedEntries.length);
      assert.equal(
        report.normalizationSummary.mappedEntries + report.normalizationSummary.unmappedEntries,
        9,
      );
      assert.deepEqual(
        report.measurements.map((measurement) => measurement.canonicalCode).sort(),
        [
          "apob",
          "epigenetic_biological_age",
          "epigenetic_fitness_age",
          "hba1c",
          "inflammation_crp",
          "ldl_cholesterol",
          "lp_a",
          "vitamin_d",
        ].sort(),
      );
      assert.deepEqual(report.unmappedEntries, [{ sourceField: "Mystery Marker", value: 12.3, unit: "arb" }]);
      const crpMeasurement = report.measurements.find(
        (measurement) => measurement.canonicalCode === "inflammation_crp",
      );
      assert.ok(crpMeasurement);
      assert.equal(crpMeasurement.textValue, "<0.3");
      assert.equal(crpMeasurement.value, undefined);
      assert.equal(crpMeasurement.unit, "mg/L");
      assert.ok(crpMeasurement.note.includes("Preserved reported text/bounded result"));
      const hba1cMeasurement = report.measurements.find((measurement) => measurement.canonicalCode === "hba1c");
      assert.ok(hba1cMeasurement);
      assert.equal(hba1cMeasurement.value, 5.26);
      assert.equal(hba1cMeasurement.unit, "%");
      assert.ok(hba1cMeasurement.note.includes("NGSP/IFCC master equation"));
      const lpAMeasurement = report.measurements.find((measurement) => measurement.canonicalCode === "lp_a");
      assert.ok(lpAMeasurement);
      assert.equal(lpAMeasurement.value, 28);
      assert.equal(lpAMeasurement.unit, "mg/dL");
      assert.ok(lpAMeasurement.note.includes("not directly interchangeable"));

      const after = await getPatientSnapshot();
      assertCountDelta(countSnapshot(before), countSnapshot(after), {
        measurements: report.measurements.length,
        reportIngestions: 1,
        timeline: 1,
      });

      const persisted = after.reportIngestions.find((ingestion) => ingestion.id === report.ingestionId);
      assert.ok(persisted);
      assert.equal(persisted.vendor, "Functional longevity panel");
      assert.equal(report.patientSnapshot.totalMeasurements, after.patient.measurements.length);
    },
  },
  {
    name: "report-intake-missing-patient",
    covers: ["POST /api/intake/report"],
    coverageType: "error",
    async run() {
      const missingPatient = await postJson(
        "/api/intake/report",
        {
          patientId: "pt_missing",
          vendor: "Functional longevity panel",
          observedAt: "2026-04-04T09:00:00.000Z",
          entries: [{ name: "Biological Age", value: 45.2, unit: "years" }],
        },
        404,
      );

      assert.equal(missingPatient.error, "Patient pt_missing was not found.");
    },
  },
  {
    name: "intervention-validation",
    covers: ["POST /api/intake/intervention"],
    coverageType: "error",
    async run() {
      const invalidJson = await postRawJson("/api/intake/intervention", "{", 400);
      assert.equal(invalidJson.error, "Request body must be valid JSON.");

      const missingFields = await postJson("/api/intake/intervention", { patientId }, 400);
      assert.equal(missingFields.error, "patientId, title, detail, and occurredAt are required.");

      const blankFields = await postJson(
        "/api/intake/intervention",
        {
          patientId: "   ",
          title: "   ",
          detail: "   ",
          occurredAt: "   ",
        },
        400,
      );
      assert.equal(blankFields.error, "patientId, title, detail, and occurredAt are required.");

      const invalidOccurredAt = await postJson(
        "/api/intake/intervention",
        {
          patientId,
          title: "Functional intervention",
          detail: "Added magnesium glycinate and tightened the sleep window.",
          occurredAt: "not-a-timestamp",
        },
        400,
      );
      assert.equal(invalidOccurredAt.error, "occurredAt must be a valid ISO-8601 timestamp.");
    },
  },
  {
    name: "intervention-state-transition",
    covers: ["POST /api/intake/intervention"],
    coverageType: "success",
    async run() {
      const before = await getPatientSnapshot();
      const intervention = await postJson("/api/intake/intervention", {
        patientId,
        title: "Functional intervention",
        detail: "Added magnesium glycinate and tightened the sleep window.",
        occurredAt: "2026-04-05T19:30:00.000Z",
      });

      const after = await getPatientSnapshot();
      assertCountDelta(countSnapshot(before), countSnapshot(after), {
        timeline: 1,
      });
      assert.equal(intervention.patientSnapshot.totalTimelineEvents, after.patient.timeline.length);
      const interventionEvent = after.patient.timeline.find((event) => event.title === "Functional intervention");
      assert.ok(interventionEvent);
      assert.equal(interventionEvent.type, "intervention");
    },
  },
  {
    name: "intervention-missing-patient",
    covers: ["POST /api/intake/intervention"],
    coverageType: "error",
    async run() {
      const missingPatient = await postJson(
        "/api/intake/intervention",
        {
          patientId: "pt_missing",
          title: "Functional intervention",
          detail: "Added magnesium glycinate and tightened the sleep window.",
          occurredAt: "2026-04-05T19:30:00.000Z",
        },
        404,
      );

      assert.equal(missingPatient.error, "Patient pt_missing was not found.");
    },
  },
  {
    name: "document-validation",
    covers: ["POST /api/intake/document"],
    coverageType: "error",
    async run() {
      const missingFields = await postMultipart(
        "/api/intake/document",
        {
          patientId,
          sourceSystem: "Functional document validation",
        },
        400,
      );
      assert.equal(missingFields.error, "patientId, sourceSystem, and file are required.");

      const blankFields = await postMultipart(
        "/api/intake/document",
        {
          patientId: "   ",
          sourceSystem: "   ",
          file: new File([createTextFixture()], "functional-note.txt", { type: "text/plain" }),
        },
        400,
      );
      assert.equal(blankFields.error, "patientId, sourceSystem, and file are required.");

      const emptyFile = await postMultipart(
        "/api/intake/document",
        {
          patientId,
          sourceSystem: "Functional document validation",
          file: new File([], "empty-note.txt", { type: "text/plain" }),
        },
        400,
      );
      assert.equal(emptyFile.error, "Choose a non-empty file.");

      const invalidObservedAt = await postMultipart(
        "/api/intake/document",
        {
          patientId,
          sourceSystem: "Functional document validation",
          observedAt: "not-a-timestamp",
          file: new File([createTextFixture()], "functional-note.txt", { type: "text/plain" }),
        },
        400,
      );
      assert.equal(invalidObservedAt.error, "observedAt must be a valid ISO-8601 timestamp.");
    },
  },
  {
    name: "document-missing-patient",
    covers: ["POST /api/intake/document"],
    coverageType: "error",
    async run() {
      const missingPatient = await postMultipart(
        "/api/intake/document",
        {
          patientId: "pt_missing",
          sourceSystem: "Functional missing patient",
          file: new File([createTextFixture()], "functional-note.txt", { type: "text/plain" }),
        },
        404,
      );

      assert.equal(missingPatient.error, "Patient pt_missing was not found.");
    },
  },
  {
    name: "document-parse-failed-json",
    covers: ["POST /api/intake/document"],
    coverageType: "success",
    async run() {
      const before = await getPatientSnapshot();
      const upload = await postMultipart("/api/intake/document", {
        patientId,
        sourceSystem: "Functional broken json",
        observedAt: "2026-04-05T10:00:00.000Z",
        file: new File([createBrokenJsonFixture()], "functional-broken.json", {
          type: "application/json",
        }),
      });
      const after = await getPatientSnapshot();

      assert.equal(upload.document.classification, "json_payload");
      assert.equal(upload.document.status, "parse_failed");

      assertCountDelta(countSnapshot(before), countSnapshot(after), {
        sourceDocuments: 1,
        parseTasks: 1,
        timeline: 1,
      });

      const task = upload.parseTasks.find((entry) => entry.sourceDocumentId === upload.document.id);
      assert.ok(task);
      assert.equal(task.parser, "generic_json");
      assert.equal(task.status, "failed");
      assert.ok(task.errorMessage);
      assertDocumentStatusMatchesTask(upload.document, task);
    },
  },
  ...documentScenarios.map((fixture) => ({
    name: `document-${fixture.name}`,
    covers: ["POST /api/intake/document"],
    coverageType: "success",
    async run() {
      const before = await getPatientSnapshot();
      const upload = await uploadDocumentFixture(fixture);
      const after = await getPatientSnapshot();
      const expectedParser = expectedParserForFixture(fixture);
      const expectedMode = expectedModeForFixture(fixture);
      const expectedStatus = expectedStatusForFixture(fixture);

      assert.equal(upload.document.classification, fixture.expectedClassification);
      assert.equal(upload.patientSnapshot.totalTimelineEvents, after.patient.timeline.length);
      assert.ok(Array.isArray(upload.nextActions) && upload.nextActions.length > 0);
      assert.ok(upload.document.id);

      assertCountDelta(countSnapshot(before), countSnapshot(after), {
        sourceDocuments: fixture.childScenarioNames ? fixture.childScenarioNames.length + 1 : 1,
        parseTasks: fixture.childScenarioNames ? fixture.childScenarioNames.length + 1 : 1,
        timeline: 1,
      });

      const persistedDocument = after.sourceDocuments.find((document) => document.id === upload.document.id);
      assert.ok(persistedDocument);

      const mainTask = upload.parseTasks.find((task) => task.sourceDocumentId === upload.document.id);
      assert.ok(mainTask);
      assert.equal(mainTask.parser, expectedParser);
      assert.equal(mainTask.mode, expectedMode);
      assert.equal(mainTask.status, expectedStatus);
      assert.ok(mainTask.candidates.length >= fixture.minCandidates);
      assertTaskShape(mainTask);
      assertDocumentStatusMatchesTask(upload.document, mainTask);

      upload.parseTasks.forEach((task) => {
        assertTaskShape(task);
        const persistedTask = after.parseTasks.find((entry) => entry.id === task.id);
        assert.ok(persistedTask);
      });

      if (fixture.childScenarioNames) {
        assert.equal(upload.extractedChildDocuments.length, fixture.childScenarioNames.length);
        assert.ok(upload.archivePreview);

        const childParsers = upload.parseTasks
          .filter((task) => task.sourceDocumentId !== upload.document.id)
          .map((task) => task.parser)
          .sort();
        const expectedChildParsers = fixture.childScenarioNames
          .map((name) => expectedParserForFixture(requireDocumentScenario(name)))
          .sort();

        assert.deepEqual(childParsers, expectedChildParsers);

        upload.extractedChildDocuments.forEach((document) => {
          const childTask = upload.parseTasks.find((task) => task.sourceDocumentId === document.id);
          assert.ok(childTask);
          assertDocumentStatusMatchesTask(document, childTask);
          assert.ok(document.parentDocumentId === upload.document.id);
        });
      } else {
        assert.equal(upload.extractedChildDocuments.length, 0);
        assert.equal(upload.archivePreview, null);
      }
    },
  })),
  {
    name: "review-validation-and-errors",
    covers: ["POST /api/review/decision"],
    coverageType: "error",
    async run() {
      const invalidJson = await postRawJson("/api/review/decision", "{", 400);
      assert.equal(invalidJson.error, "Request body must be valid JSON.");

      const missingFields = await postJson("/api/review/decision", { patientId }, 400);
      assert.equal(
        missingFields.error,
        "patientId, parseTaskId, candidateId, action, and reviewerName are required.",
      );

      const blankFields = await postJson(
        "/api/review/decision",
        {
          patientId: "   ",
          parseTaskId: "   ",
          candidateId: "   ",
          action: "accept",
          reviewerName: "   ",
        },
        400,
      );
      assert.equal(
        blankFields.error,
        "patientId, parseTaskId, candidateId, action, and reviewerName are required.",
      );

      const upload = await uploadDocumentFixture(requireDocumentScenario("csv"));
      const target = findReviewableCandidate(upload.parseTasks, () => true);
      assert.ok(target);

      const invalidCode = await postJson(
        "/api/review/decision",
        {
          patientId,
          parseTaskId: target.task.id,
          candidateId: target.candidate.id,
          action: "accept",
          reviewerName: "Functional reviewer",
          proposedCanonicalCode: "not_in_catalog",
        },
        400,
      );

      assert.ok(invalidCode.error.includes("is not in the catalog"));

      const missingParseTask = await postJson(
        "/api/review/decision",
        {
          patientId,
          parseTaskId: "missing-task",
          candidateId: "missing-candidate",
          action: "accept",
          reviewerName: "Functional reviewer",
        },
        404,
      );

      assert.equal(missingParseTask.error, "Parse task missing-task was not found.");
    },
  },
  {
    name: "review-decision-create-and-update",
    covers: ["POST /api/review/decision"],
    coverageType: "mixed",
    async run() {
      const upload = await uploadDocumentFixture(requireDocumentScenario("csv"));
      const target = findPromotableReviewTarget(upload.parseTasks);
      assert.ok(target);

      const afterUpload = await getPatientSnapshot();
      const firstDecision = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "accept",
        reviewerName: "Functional reviewer",
        note: "Looks clean for promotion.",
        proposedCanonicalCode: target.proposedCanonicalCode,
      });

      const afterFirstDecision = await getPatientSnapshot();
      assertCountDelta(countSnapshot(afterUpload), countSnapshot(afterFirstDecision), {
        reviewDecisions: 1,
        timeline: 1,
      });
      assert.equal(firstDecision.decision.action, "accept");
      assert.equal(firstDecision.decision.proposedCanonicalCode, target.proposedCanonicalCode);

      const updatedDecision = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "follow_up",
        reviewerName: "Functional reviewer",
        note: "Hold until reference range is confirmed.",
        proposedCanonicalCode: "apob",
      });

      const afterUpdate = await getPatientSnapshot();
      assertCountDelta(countSnapshot(afterFirstDecision), countSnapshot(afterUpdate), {
        reviewDecisions: 0,
        timeline: 1,
      });
      assert.equal(updatedDecision.decision.id, firstDecision.decision.id);
      assert.equal(updatedDecision.decision.action, "follow_up");
      assert.equal(updatedDecision.decision.proposedCanonicalCode, undefined);
      assert.equal(updatedDecision.decision.proposedTitle, undefined);
      assert.equal(updatedDecision.decision.proposedModality, undefined);

      const missingCandidate = await postJson(
        "/api/review/decision",
        {
          patientId,
          parseTaskId: target.task.id,
          candidateId: "missing-candidate",
          action: "accept",
          reviewerName: "Functional reviewer",
        },
        404,
      );

      assert.equal(
        missingCandidate.error,
        `Candidate missing-candidate was not found on parse task ${target.task.id}.`,
      );
    },
  },
  {
    name: "review-decision-rejects-updates-after-promotion",
    covers: ["POST /api/review/decision"],
    coverageType: "error",
    async run() {
      const upload = await uploadDocumentFixture(requireDocumentScenario("csv"));
      const target = findPromotableReviewTarget(upload.parseTasks);
      assert.ok(target);

      const review = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "accept",
        reviewerName: "Functional reviewer",
        note: "Accepting before promotion immutability check.",
        proposedCanonicalCode: target.proposedCanonicalCode,
      });

      await postJson("/api/review/promote", {
        patientId,
        reviewDecisionId: review.decision.id,
      });

      const beforeBlockedUpdate = await getPatientSnapshot();
      const blockedUpdate = await postJson(
        "/api/review/decision",
        {
          patientId,
          parseTaskId: target.task.id,
          candidateId: target.candidate.id,
          action: "reject",
          reviewerName: "Functional reviewer",
          note: "This update should be rejected after promotion.",
        },
        400,
      );
      const afterBlockedUpdate = await getPatientSnapshot();

      assert.equal(
        blockedUpdate.error,
        `Review decision ${review.decision.id} was already promoted and cannot be changed.`,
      );
      assert.deepEqual(
        afterBlockedUpdate,
        beforeBlockedUpdate,
        "Promoted review decisions should remain unchanged when an update is attempted.",
      );
    },
  },
  {
    name: "promotion-validation-and-idempotence",
    covers: ["POST /api/review/promote"],
    coverageType: "mixed",
    async run() {
      const invalidJson = await postRawJson("/api/review/promote", "{", 400);
      assert.equal(invalidJson.error, "Request body must be valid JSON.");

      const missingFields = await postJson("/api/review/promote", { patientId }, 400);
      assert.equal(missingFields.error, "patientId and reviewDecisionId are required.");

      const blankFields = await postJson(
        "/api/review/promote",
        {
          patientId: "   ",
          reviewDecisionId: "   ",
        },
        400,
      );
      assert.equal(blankFields.error, "patientId and reviewDecisionId are required.");

      const missingDecision = await postJson(
        "/api/review/promote",
        {
          patientId,
          reviewDecisionId: "missing-decision",
        },
        404,
      );

      assert.equal(missingDecision.error, "Review decision missing-decision was not found.");

      const upload = await uploadDocumentFixture(requireDocumentScenario("fhir-bundle"));
      const target = findPromotableReviewTarget(upload.parseTasks);
      assert.ok(target);

      const review = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "accept",
        reviewerName: "Functional reviewer",
        proposedCanonicalCode: target.proposedCanonicalCode,
      });

      const afterReview = await getPatientSnapshot();
      const firstPromotion = await postJson("/api/review/promote", {
        patientId,
        reviewDecisionId: review.decision.id,
      });

      const afterFirstPromotion = await getPatientSnapshot();
      assert.equal(firstPromotion.alreadyPromoted, false);
      assert.equal(firstPromotion.measurement.canonicalCode, target.proposedCanonicalCode);
      assertCountDelta(countSnapshot(afterReview), countSnapshot(afterFirstPromotion), {
        measurements: 1,
        measurementPromotions: 1,
        timeline: 1,
      });

      const secondPromotion = await postJson("/api/review/promote", {
        patientId,
        reviewDecisionId: review.decision.id,
      });

      const afterSecondPromotion = await getPatientSnapshot();
      assert.equal(secondPromotion.alreadyPromoted, true);
      assert.equal(secondPromotion.promotion.id, firstPromotion.promotion.id);
      assert.equal(secondPromotion.measurement.id, firstPromotion.measurement.id);
      assert.deepEqual(countSnapshot(afterSecondPromotion), countSnapshot(afterFirstPromotion));
    },
  },
  {
    name: "promotion-rejects-non-accepted-decisions",
    covers: ["POST /api/review/promote"],
    coverageType: "error",
    async run() {
      const upload = await uploadDocumentFixture(requireDocumentScenario("csv"));
      const target = findPromotableReviewTarget(upload.parseTasks);
      assert.ok(target);

      const decision = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "reject",
        reviewerName: "Functional reviewer",
      });

      const beforePromotion = await getPatientSnapshot();
      const failedPromotion = await postJson(
        "/api/review/promote",
        {
          patientId,
          reviewDecisionId: decision.decision.id,
        },
        400,
      );

      const afterPromotionAttempt = await getPatientSnapshot();
      assert.ok(failedPromotion.error.includes("cannot be promoted"));
      assert.deepEqual(countSnapshot(afterPromotionAttempt), countSnapshot(beforePromotion));
    },
  },
  {
    name: "promotion-rejects-accepted-decisions-without-mapping",
    covers: ["POST /api/review/promote"],
    coverageType: "error",
    async run() {
      const upload = await uploadDocumentFixture(requireDocumentScenario("csv"));
      const target = findPromotableReviewTarget(upload.parseTasks);
      assert.ok(target);

      const decision = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "accept",
        reviewerName: "Functional reviewer",
      });

      const beforePromotion = await getPatientSnapshot();
      const failedPromotion = await postJson(
        "/api/review/promote",
        {
          patientId,
          reviewDecisionId: decision.decision.id,
        },
        400,
      );

      const afterPromotionAttempt = await getPatientSnapshot();
      assert.ok(failedPromotion.error.includes("does not include a proposed canonical mapping"));
      assert.deepEqual(countSnapshot(afterPromotionAttempt), countSnapshot(beforePromotion));
    },
  },
  {
    name: "promotion-promotes-text-candidates",
    covers: ["POST /api/review/promote"],
    coverageType: "success",
    async run() {
      const upload = await postMultipart("/api/intake/document", {
        patientId,
        sourceSystem: "Functional text observation",
        observedAt: "2026-04-05T10:00:00.000Z",
        file: new File([createTextFhirResource()], "functional-text-observation.json", {
          type: "application/json",
        }),
      });

      const target = findReviewableCandidate(upload.parseTasks, (candidate) => candidate.numericValue === undefined && candidateHasPromotableValue(candidate));
      assert.ok(target);

      const decision = await postJson("/api/review/decision", {
        patientId,
        parseTaskId: target.task.id,
        candidateId: target.candidate.id,
        action: "accept",
        reviewerName: "Functional reviewer",
        proposedCanonicalCode: "apob",
      });

      const beforePromotion = await getPatientSnapshot();
      const promoted = await postJson("/api/review/promote", {
        patientId,
        reviewDecisionId: decision.decision.id,
      });

      const afterPromotion = await getPatientSnapshot();
      assert.equal(promoted.alreadyPromoted, false);
      assert.equal(promoted.measurement.canonicalCode, "apob");
      assert.equal(promoted.measurement.textValue, "borderline high");
      assert.equal(promoted.measurement.value, undefined);
      assert.equal(promoted.measurement.unit, undefined);
      assertCountDelta(countSnapshot(beforePromotion), countSnapshot(afterPromotion), {
        measurements: 1,
        measurementPromotions: 1,
        timeline: 1,
      });
    },
  },
];

async function assertApiRouteCoverage() {
  scenarios.forEach((scenario) => {
    assert.ok(
      Array.isArray(scenario.covers) && scenario.covers.length > 0,
      `Scenario ${scenario.name} must declare the route methods it covers.`,
    );
    assert.ok(
      ["success", "error", "mixed"].includes(scenario.coverageType),
      `Scenario ${scenario.name} must declare a valid coverageType.`,
    );
  });

  const coveredRouteMethods = [...new Set(scenarios.flatMap((scenario) => scenario.covers))].sort();
  const discoveredRouteMethods = await discoverApiRouteMethods();
  assert.deepEqual(
    coveredRouteMethods,
    discoveredRouteMethods,
    "Functional scenarios must claim every exported API route method under app/api.",
  );

  const routeCoverageKinds = new Map();
  scenarios.forEach((scenario) => {
    scenario.covers.forEach((routeMethod) => {
      const kinds = routeCoverageKinds.get(routeMethod) ?? new Set();
      kinds.add(scenario.coverageType);
      routeCoverageKinds.set(routeMethod, kinds);
    });
  });

  discoveredRouteMethods.forEach((routeMethod) => {
    const kinds = routeCoverageKinds.get(routeMethod) ?? new Set();
    assert.ok(
      kinds.has("success") || kinds.has("mixed"),
      `Functional scenarios must include a success path for ${routeMethod}.`,
    );
    assert.ok(
      kinds.has("error") || kinds.has("mixed"),
      `Functional scenarios must include an error path for ${routeMethod}.`,
    );
  });
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `longevity-functional-${backend}-`));
  const baselineUploads = await listUploadFiles();
  const backendController = await prepareBackend(tempDir, baselineUploads);
  const scenarioResults = [];

  const server = spawn(process.execPath, [nextCli, "start", "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
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
    await assertApiRouteCoverage();
    await waitForServer();
    log("server", "ready");

    for (const scenario of scenarios) {
      scenarioResults.push(await runScenario(scenario.name, backendController, scenario.run));
    }

    if (process.env.FUNCTIONAL_REPORT_PATH?.trim()) {
      await writeFile(
        process.env.FUNCTIONAL_REPORT_PATH.trim(),
        JSON.stringify(
          {
            backend,
            patientId,
            scenarioResults,
          },
          null,
          2,
        ),
      );
    }

    log("verification", `${scenarios.length} functional scenarios passed`);
  } finally {
    await stopServer(server);
    await backendController.cleanup();
    await rm(tempDir, { recursive: true, force: true });

    if (server.exitCode !== null && server.exitCode !== 0) {
      throw new Error(`Server exited with code ${server.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error(
    `[functional-tests:${backend}] failed: ${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exit(1);
});
