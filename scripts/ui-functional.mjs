import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readdir, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { loadPersistedPatientSnapshot } from "./lib/persisted-patient-snapshot.mjs";

const repoRoot = process.cwd();
const patientId = "pt_001";
const storePath = path.join(repoRoot, "data", "store.json");
const uploadsPath = path.join(repoRoot, "data", "uploads");
const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const port = Number(process.env.UI_FUNCTIONAL_PORT?.trim() || "3160");
const baseUrl = `http://127.0.0.1:${port}`;
const workbenchHeadings = new Set([
  "Upload a source file",
  "Adjudicate parser candidates",
  "Promote accepted decisions",
  "Report intake and normalization",
  "Tag a protocol change",
]);

function log(step, detail) {
  console.log(`[ui-functional:file] ${step}: ${detail}`);
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
    async cleanup() {
      await copyFile(backupPath, storePath);
      await resetUploads(baselineUploads);
    },
  };
}

async function run(command, args) {
  const useShell = process.platform === "win32";
  const label = [command, ...args].join(" ");

  await new Promise((resolve, reject) => {
    const child = spawn(useShell ? label : command, useShell ? [] : args, {
      cwd: repoRoot,
      shell: useShell,
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} exited from signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} exited with code ${code}`));
        return;
      }

      resolve(undefined);
    });
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Executable doesn't exist")) {
      throw error;
    }

    log("browser", "installing Chromium because no Playwright browser was found");
    await run(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "install", "chromium"]);
    return chromium.launch({ headless: true });
  }
}

function sectionByHeading(page, heading) {
  return page.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::section[1]");
}

async function refreshDashboard(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Upload a source file", exact: true }).waitFor();
}

async function waitForSelectOptionContaining(selectLocator, text) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const options = await selectLocator.locator("option").allTextContents();
    if (options.some((option) => option.includes(text))) {
      return;
    }

    await selectLocator.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for select option containing "${text}".`);
}

function countFlaggedSignals(snapshot) {
  return snapshot.patient.measurements.filter(
    (measurement) => measurement.evidenceStatus === "conflicted" || measurement.evidenceStatus === "watch",
  ).length;
}

function countImprovingSignals(snapshot) {
  return snapshot.patient.measurements.filter((measurement) => measurement.evidenceStatus === "improving").length;
}

async function loadPersistedSnapshot() {
  const snapshot = await loadPersistedPatientSnapshot({
    backend: "file",
    patientId,
    repoRoot,
  });
  assert.ok(snapshot, `Persisted patient ${patientId} should exist.`);
  return snapshot;
}

async function expectSectionHeadPill(section, text) {
  await section.locator(".section-head .pill").first().waitFor();
  assert.equal((await section.locator(".section-head .pill").first().textContent())?.trim(), text);
}

async function expectDetailCardValue(section, label, value) {
  const card = section.locator(".detail-card").filter({ hasText: label }).first();
  await card.waitFor();
  assert.equal((await card.locator(".summary-value").first().textContent())?.trim(), value);
}

async function assertDashboardMatchesSnapshot(sections, snapshot) {
  await expectSectionHeadPill(sections.sourceDocumentsSection, `${snapshot.sourceDocuments.length} stored`);
  await expectSectionHeadPill(sections.parseTasksSection, `${snapshot.parseTasks.length} tasks`);
  await expectSectionHeadPill(sections.timelineSection, `${snapshot.patient.timeline.length} tracked events`);
  await expectSectionHeadPill(sections.reviewSection, `${snapshot.reviewDecisions.length} decisions`);
  await expectSectionHeadPill(sections.promotionSection, `${snapshot.measurementPromotions.length} promotions`);
  await expectSectionHeadPill(sections.flaggedSignalsSection, `${countFlaggedSignals(snapshot)} flagged`);
  await sections.clinicianPrepSection.getByText(snapshot.patient.focus, { exact: true }).waitFor();
  await expectDetailCardValue(
    sections.clinicianPrepSection,
    "Improving signals",
    String(countImprovingSignals(snapshot)),
  );
  await expectDetailCardValue(
    sections.clinicianPrepSection,
    "Conflicts to review",
    String(
      snapshot.patient.measurements.filter((measurement) => measurement.evidenceStatus === "conflicted").length,
    ),
  );

  const renderedSignalTitles = (await sections.signalBoardSection.locator(".signal-card .signal-title").allTextContents()).map(
    (title) => title.trim(),
  );
  const expectedSignalTitles = snapshot.patient.measurements.slice(0, 3).map((measurement) => measurement.title);
  assert.deepEqual(renderedSignalTitles, expectedSignalTitles);
}

async function assertUiStateUnchangedAfterError(page, sections, expectedSnapshot, discoveredWorkbenchHeadings) {
  const currentSnapshot = await loadPersistedSnapshot();
  assert.deepEqual(currentSnapshot, expectedSnapshot);
  await refreshDashboard(page);
  await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
  await assertDashboardMatchesSnapshot(sections, currentSnapshot);
}

async function discoverInteractiveWorkbenchHeadings(page) {
  const headings = await page.locator("section").evaluateAll((sections) =>
    sections
      .flatMap((section) => {
        const actionButton = section.querySelector("button");
        const inputControl = section.querySelector("input, select, textarea");
        const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
        if (!actionButton || !inputControl || !heading) {
          return [];
        }

        const text = heading.textContent?.trim();
        return text ? [text] : [];
      })
      .sort(),
  );

  return [...new Set(headings)];
}

async function mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings) {
  for (const heading of await discoverInteractiveWorkbenchHeadings(page)) {
    discoveredWorkbenchHeadings.add(heading);
  }
}

async function discoverDashboardSectionHeadings(page) {
  const headings = await page.locator("section, aside").evaluateAll((elements) =>
    elements
      .flatMap((element) => {
        if (element.querySelector("input, select, textarea, button")) {
          return [];
        }

        const heading = element.querySelector(".section-title");
        const text = heading?.textContent?.trim();
        return text ? [text] : [];
      })
      .sort(),
  );

  return [...new Set(headings)].filter((heading) => !workbenchHeadings.has(heading)).sort();
}

function csvFixture() {
  return Buffer.from(
    [
      "name,result,unit,loinc,observed_at",
      "ApoB,78,mg/dL,1884-6,2026-04-01T08:00:00.000Z",
      "C-Reactive Protein,1.1,mg/L,1988-5,2026-04-01T08:00:00.000Z",
    ].join("\n"),
  );
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "longevity-ui-functional-"));
  const baselineUploads = await listUploadFiles();
  const backend = await prepareFileBackend(tempDir, baselineUploads);

  const server = spawn(process.execPath, [nextCli, "start", "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      PERSISTENCE_BACKEND: "file",
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

  let browser;

  try {
    await waitForServer();
    browser = await launchBrowser();
    log("server", "ready");

    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    await page.getByRole("heading", { name: "Upload a source file", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Report intake and normalization", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Tag a protocol change", exact: true }).waitFor();
    await page.getByRole("heading", { name: "What the first customers are buying", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Signals needing clinician review", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Modality-aware evidence cards", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Clinician prep", exact: true }).waitFor();
    const discoveredWorkbenchHeadings = new Set();
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    const discoveredDashboardHeadings = await discoverDashboardSectionHeadings(page);
    const successfulWorkbenchHeadings = new Set();
    const errorWorkbenchHeadings = new Set();
    const coveredDashboardHeadings = new Set([
      "What the first customers are buying",
      "Signals needing clinician review",
      "Clinician prep",
    ]);
    log("page", "workbenches rendered");

    const sourceDocumentsSection = sectionByHeading(page, "Stored source documents");
    const parseTasksSection = sectionByHeading(page, "Document parse tasks");
    const timelineSection = sectionByHeading(page, "Interventions and evidence windows");
    const signalBoardSection = sectionByHeading(page, "Modality-aware evidence cards");
    const clinicianPrepSection = sectionByHeading(page, "Clinician prep");
    const flaggedSignalsSection = sectionByHeading(page, "Signals needing clinician review");
    const documentSection = sectionByHeading(page, "Upload a source file");
    const reviewSection = sectionByHeading(page, "Adjudicate parser candidates");
    const promotionSection = sectionByHeading(page, "Promote accepted decisions");
    const reportSection = sectionByHeading(page, "Report intake and normalization");
    const interventionSection = sectionByHeading(page, "Tag a protocol change");

    const sections = {
      sourceDocumentsSection,
      parseTasksSection,
      timelineSection,
      signalBoardSection,
      clinicianPrepSection,
      flaggedSignalsSection,
      reviewSection,
      promotionSection,
    };

    await clinicianPrepSection
      .getByText("Longevity follow-up after sleep, resistance training, and omega-3 protocol.", { exact: true })
      .waitFor();
    await signalBoardSection.getByText("Epigenetic Biological Age", { exact: true }).waitFor();
    coveredDashboardHeadings.add("Modality-aware evidence cards");
    coveredDashboardHeadings.add("Clinician prep");
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());

    const documentFilename = "ui-functional.csv";
    const documentErrorSnapshot = await loadPersistedSnapshot();
    await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill("   ");
    await documentSection.locator('input[type="file"]').setInputFiles({
      name: documentFilename,
      mimeType: "text/csv",
      buffer: csvFixture(),
    });
    await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
    await documentSection.locator("pre").filter({ hasText: '"error": "patientId, sourceSystem, and file are required."' }).waitFor();
    errorWorkbenchHeadings.add("Upload a source file");
    await assertUiStateUnchangedAfterError(page, sections, documentErrorSnapshot, discoveredWorkbenchHeadings);
    log("document", "rejected blank source-system upload without mutating persisted state");

    successfulWorkbenchHeadings.add("Upload a source file");
    await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill("UI functional upload");
    await documentSection.locator('input[type="file"]').setInputFiles({
      name: documentFilename,
      mimeType: "text/csv",
      buffer: csvFixture(),
    });
    await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
    await documentSection.locator("pre").filter({ hasText: `"originalFilename": "${documentFilename}"` }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await sourceDocumentsSection.getByText(documentFilename, { exact: true }).waitFor();
    await parseTasksSection.getByText(documentFilename, { exact: true }).waitFor();
    await parseTasksSection.getByText("csv_table", { exact: true }).waitFor();
    coveredDashboardHeadings.add("Stored source documents");
    coveredDashboardHeadings.add("Document parse tasks");
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());
    log("document", "uploaded CSV through the UI and observed parser task on the page");

    const parseTaskSelect = reviewSection.locator("select").nth(0);
    const candidateSelect = reviewSection.locator("select").nth(1);
    const reviewErrorSnapshot = await loadPersistedSnapshot();
    await waitForSelectOptionContaining(parseTaskSelect, documentFilename);
    await parseTaskSelect.selectOption({ label: `${documentFilename} | csv_table` });
    await waitForSelectOptionContaining(candidateSelect, "ApoB | 78 mg/dL");
    await candidateSelect.selectOption({ label: "ApoB | 78 mg/dL" });
    await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill("   ");
    await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
    await reviewSection
      .locator("pre")
      .filter({ hasText: '"error": "patientId, parseTaskId, candidateId, action, and reviewerName are required."' })
      .waitFor();
    errorWorkbenchHeadings.add("Adjudicate parser candidates");
    await assertUiStateUnchangedAfterError(page, sections, reviewErrorSnapshot, discoveredWorkbenchHeadings);
    log("review", "rejected blank reviewer input without mutating persisted state");

    successfulWorkbenchHeadings.add("Adjudicate parser candidates");
    await waitForSelectOptionContaining(parseTaskSelect, documentFilename);
    await parseTaskSelect.selectOption({ label: `${documentFilename} | csv_table` });
    await waitForSelectOptionContaining(candidateSelect, "ApoB | 78 mg/dL");
    await candidateSelect.selectOption({ label: "ApoB | 78 mg/dL" });
    await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill("UI clinician");
    await reviewSection.locator("label").filter({ hasText: "Proposed canonical mapping" }).locator("select").selectOption("apob");
    await reviewSection.locator("label").filter({ hasText: "Note" }).locator("textarea").fill("UI review path accepted for promotion.");
    await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
    await reviewSection.locator("pre").filter({ hasText: '"action": "accept"' }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await reviewSection.getByText("UI clinician").waitFor();
    await parseTasksSection.getByText("1 reviewed").waitFor();
    coveredDashboardHeadings.add("Document parse tasks");
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());
    log("review", "accepted and mapped a parser candidate through the UI");

    const promotionSelect = promotionSection.locator("select").first();
    const promotionErrorSnapshot = await loadPersistedSnapshot();
    await waitForSelectOptionContaining(promotionSelect, "ApoB to apob");
    await page.route(
      "**/api/review/promote",
      async (route) => {
        await route.continue({
          postData: JSON.stringify({
            patientId,
            reviewDecisionId: "missing-review-decision",
          }),
        });
      },
      { times: 1 },
    );
    await promotionSection.getByRole("button", { name: "Promote measurement", exact: true }).click();
    await promotionSection
      .locator("pre")
      .filter({ hasText: '"error": "Review decision missing-review-decision was not found."' })
      .waitFor();
    errorWorkbenchHeadings.add("Promote accepted decisions");
    await assertUiStateUnchangedAfterError(page, sections, promotionErrorSnapshot, discoveredWorkbenchHeadings);
    log("promotion", "rejected an invalid promotion request without mutating persisted state");

    successfulWorkbenchHeadings.add("Promote accepted decisions");
    await waitForSelectOptionContaining(promotionSelect, "ApoB to apob");
    await promotionSection.getByRole("button", { name: "Promote measurement", exact: true }).click();
    await promotionSection.locator("pre").filter({ hasText: '"canonicalCode": "apob"' }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await promotionSection.getByText("ApoB", { exact: true }).waitFor();
    await timelineSection.getByText("ApoB promoted into canonical record").waitFor();
    coveredDashboardHeadings.add("Interventions and evidence windows");
    coveredDashboardHeadings.add("Modality-aware evidence cards");
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());
    log("promotion", "promoted the accepted review decision through the UI");

    const reportErrorSnapshot = await loadPersistedSnapshot();
    await reportSection.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea").fill('{"not":"an array"}');
    await reportSection.getByRole("button", { name: "Run normalization", exact: true }).click();
    await reportSection.locator("pre").filter({ hasText: '"error": "entries must be an array."' }).waitFor();
    errorWorkbenchHeadings.add("Report intake and normalization");
    await assertUiStateUnchangedAfterError(page, sections, reportErrorSnapshot, discoveredWorkbenchHeadings);
    log("report", "rejected invalid entries payload without mutating persisted state");

    successfulWorkbenchHeadings.add("Report intake and normalization");
    await reportSection.locator("label").filter({ hasText: "Vendor" }).locator("select").selectOption("Hurdle");
    await reportSection.getByRole("button", { name: "Run normalization", exact: true }).click();
    await reportSection.locator("pre").filter({ hasText: '"mappedEntries": 3' }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await timelineSection.getByText("Hurdle report normalized").waitFor();
    coveredDashboardHeadings.add("Interventions and evidence windows");
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());
    log("report", "ran report normalization through the UI");

    const interventionErrorSnapshot = await loadPersistedSnapshot();
    await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").fill("   ");
    await interventionSection
      .locator("label")
      .filter({ hasText: "Detail" })
      .locator("textarea")
      .fill("   ");
    await interventionSection.getByRole("button", { name: "Save intervention", exact: true }).click();
    await interventionSection
      .locator("pre")
      .filter({ hasText: '"error": "patientId, title, detail, and occurredAt are required."' })
      .waitFor();
    errorWorkbenchHeadings.add("Tag a protocol change");
    await assertUiStateUnchangedAfterError(page, sections, interventionErrorSnapshot, discoveredWorkbenchHeadings);
    log("intervention", "rejected blank intervention fields without mutating persisted state");

    successfulWorkbenchHeadings.add("Tag a protocol change");
    await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").fill("UI intervention checkpoint");
    await interventionSection.locator("label").filter({ hasText: "Detail" }).locator("textarea").fill(
      "Added a UI-level intervention event to confirm timeline refresh behavior.",
    );
    await interventionSection.getByRole("button", { name: "Save intervention", exact: true }).click();
    await interventionSection.locator("pre").filter({ hasText: '"totalTimelineEvents"' }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await timelineSection.getByText("UI intervention checkpoint").waitFor();
    coveredDashboardHeadings.add("Interventions and evidence windows");
    const snapshot = await loadPersistedSnapshot();
    await assertDashboardMatchesSnapshot(sections, snapshot);
    log("intervention", "saved an intervention through the UI");

    assert.ok(snapshot.sourceDocuments.some((document) => document.originalFilename === documentFilename));
    assert.ok(snapshot.reviewDecisions.some((decision) => decision.reviewerName === "UI clinician"));
    assert.ok(snapshot.measurementPromotions.some((promotion) => promotion.canonicalCode === "apob"));
    assert.ok(snapshot.reportIngestions.some((ingestion) => ingestion.vendor === "Hurdle"));
    assert.ok(snapshot.patient.timeline.some((event) => event.title === "UI intervention checkpoint"));
    assert.deepEqual([...successfulWorkbenchHeadings].sort(), [...discoveredWorkbenchHeadings].sort());
    assert.deepEqual([...errorWorkbenchHeadings].sort(), [...discoveredWorkbenchHeadings].sort());
    assert.deepEqual([...coveredDashboardHeadings].sort(), discoveredDashboardHeadings);
    log("verification", "page interactions, error handling, and persisted state matched");
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await backend.cleanup();
    await rm(tempDir, { recursive: true, force: true });

    if (server.exitCode !== null && server.exitCode !== 0) {
      throw new Error(`Server exited with code ${server.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error(`[ui-functional:file] failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
