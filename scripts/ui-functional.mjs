import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readdir, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import JSZip from "jszip";
import { resolveCanonicalCodeForName } from "./lib/canonical-catalog.mjs";
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

async function waitForSelectOptionValue(selectLocator, value) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const options = await selectLocator.locator("option").evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("value") ?? ""),
    );
    if (options.includes(value)) {
      return;
    }

    await selectLocator.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for select option value "${value}".`);
}

async function readSelectOptionValues(selectLocator) {
  return selectLocator.locator("option").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("value") ?? ""),
  );
}

async function waitForSelectOptionValueToDisappear(selectLocator, value) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const options = await readSelectOptionValues(selectLocator);
    if (!options.includes(value)) {
      return options;
    }

    await selectLocator.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for select option value "${value}" to disappear.`);
}

async function assertReviewFormState(section, expected) {
  const actionSelect = section.locator("label").filter({ hasText: "Action" }).locator("select");
  const reviewerInput = section.locator("label").filter({ hasText: "Reviewer" }).locator("input");
  const mappingSelect = section.locator("label").filter({ hasText: "Proposed canonical mapping" }).locator("select");
  const noteArea = section.locator("label").filter({ hasText: "Note" }).locator("textarea");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const actual = {
      action: await actionSelect.inputValue(),
      reviewerName: await reviewerInput.inputValue(),
      proposedCanonicalCode: await mappingSelect.inputValue(),
      note: await noteArea.inputValue(),
      mappingDisabled: await mappingSelect.isDisabled(),
    };

    if (
      actual.action === expected.action &&
      actual.reviewerName === expected.reviewerName &&
      actual.proposedCanonicalCode === expected.proposedCanonicalCode &&
      actual.note === expected.note &&
      actual.mappingDisabled === (expected.action !== "accept")
    ) {
      return;
    }

    await section.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for review form state ${JSON.stringify(expected)}.`);
}

async function waitForInputValue(locator, expectedValue) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await locator.inputValue()) === expectedValue) {
      return;
    }

    await locator.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for input value ${JSON.stringify(expectedValue)}.`);
}

async function assertDocumentDraftState(section, expected) {
  const sourceSystemInput = section.locator("label").filter({ hasText: "Source system" }).locator("input");
  await waitForInputValue(sourceSystemInput, expected.sourceSystem);

  if (expected.filePreviewText) {
    await section.locator(".field-note").filter({ hasText: expected.filePreviewText }).waitFor();
    return;
  }

  await section
    .locator(".field-note")
    .filter({ hasText: "Choose a PDF, image, JSON, XML, CSV, XLS/XLSX, TXT, HTML, or ZIP file." })
    .waitFor();
}

async function assertReportDraftState(section, expected) {
  const vendorSelect = section.locator("label").filter({ hasText: "Vendor" }).locator("select");
  const payloadArea = section.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea");
  await waitForInputValue(vendorSelect, expected.vendor);
  await waitForInputValue(payloadArea, expected.payloadText);
}

async function assertInterventionDraftState(section, expected) {
  const titleInput = section.locator("label").filter({ hasText: "Title" }).locator("input");
  const dateInput = section.locator("label").filter({ hasText: "Date" }).locator("input");
  const detailArea = section.locator("label").filter({ hasText: "Detail" }).locator("textarea");
  await waitForInputValue(titleInput, expected.title);
  await waitForInputValue(dateInput, expected.occurredAt);
  await waitForInputValue(detailArea, expected.detail);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDisabledState(locator, expectedDisabled) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await locator.isDisabled()) === expectedDisabled) {
      return;
    }

    await locator.page().waitForTimeout(100);
  }

  throw new Error(`Timed out waiting for disabled state ${String(expectedDisabled)}.`);
}

async function waitForButtonText(buttonLocator, expectedText) {
  let lastText = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const actualText = normalizeWhitespace((await buttonLocator.textContent()) ?? "");
    lastText = actualText;
    if (actualText === expectedText) {
      return;
    }

    await buttonLocator.page().waitForTimeout(100);
  }

  throw new Error(
    `Timed out waiting for button text ${JSON.stringify(expectedText)}; last text was ${JSON.stringify(lastText)}.`,
  );
}

async function assertDocumentSubmittingState(section) {
  const submitButton = section.locator(".actions .button-primary");
  const resetButton = section.locator(".actions .button-secondary");
  await waitForButtonText(submitButton, "Uploading...");
  await waitForDisabledState(submitButton, true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Source system/ }).locator("input"), true);
  await waitForDisabledState(section.locator('input[type="file"]'), true);
  await waitForDisabledState(resetButton, true);
}

async function assertReviewSubmittingState(section) {
  const submitButton = section.locator(".actions .button-primary");
  const resetButton = section.locator(".actions .button-secondary");
  await waitForButtonText(submitButton, "Saving...");
  await waitForDisabledState(submitButton, true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Parse task/ }).locator("select"), true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Candidate/ }).locator("select"), true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Action/ }).locator("select"), true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Reviewer/ }).locator("input"), true);
  await waitForDisabledState(
    section.locator("label").filter({ hasText: /^Proposed canonical mapping/ }).locator("select"),
    true,
  );
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Note/ }).locator("textarea"), true);
  await waitForDisabledState(resetButton, true);
}

async function assertPromotionSubmittingState(section) {
  const submitButton = section.locator(".actions .button-primary");
  const resetButton = section.locator(".actions .button-secondary");
  await waitForButtonText(submitButton, "Promoting...");
  await waitForDisabledState(submitButton, true);
  await waitForDisabledState(
    section.locator("label").filter({ hasText: /^Accepted review decision/ }).locator("select"),
    true,
  );
  await waitForDisabledState(resetButton, true);
}

async function assertReportSubmittingState(section) {
  const submitButton = section.locator(".actions .button-primary");
  const resetButton = section.locator(".actions .button-secondary");
  await waitForButtonText(submitButton, "Normalizing...");
  await waitForDisabledState(submitButton, true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Vendor/ }).locator("select"), true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Entries JSON/ }).locator("textarea"), true);
  await waitForDisabledState(resetButton, true);
}

async function assertInterventionSubmittingState(section) {
  const submitButton = section.locator(".actions .button-primary");
  const resetButton = section.locator(".actions .button-secondary");
  await waitForButtonText(submitButton, "Saving...");
  await waitForDisabledState(submitButton, true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Title/ }).locator("input"), true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Date/ }).locator("input"), true);
  await waitForDisabledState(section.locator("label").filter({ hasText: /^Detail/ }).locator("textarea"), true);
  await waitForDisabledState(resetButton, true);
}

async function waitForReviewMappingState(section, expectedValue, expectedDisabled) {
  const mappingSelect = section.locator("label").filter({ hasText: "Proposed canonical mapping" }).locator("select");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const actualValue = await mappingSelect.inputValue();
    const actualDisabled = await mappingSelect.isDisabled();

    if (actualValue === expectedValue && actualDisabled === expectedDisabled) {
      return;
    }

    await section.page().waitForTimeout(200);
  }

  throw new Error(
    `Timed out waiting for review mapping state value=${expectedValue} disabled=${String(expectedDisabled)}.`,
  );
}

async function waitForReviewCandidateSnapshot(section, candidate) {
  const snapshotCard = section.locator(".detail-card").filter({ hasText: "Candidate snapshot" }).first();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const copy = normalizeWhitespace((await snapshotCard.locator(".detail-copy").textContent()) ?? "");
    const sourcePath = normalizeWhitespace((await snapshotCard.locator(".summary-note").textContent()) ?? "");

    if (copy === `${candidate.displayName} | ${candidate.valueLabel}` && sourcePath === candidate.sourcePath) {
      return;
    }

    await section.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for review candidate snapshot for ${candidate.displayName}.`);
}

async function waitForPromotionSnapshot(section, decision) {
  const snapshotCard = section.locator(".detail-card").filter({ hasText: "Promotion snapshot" }).first();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const copy = normalizeWhitespace((await snapshotCard.locator(".detail-copy").textContent()) ?? "");
    const summary = normalizeWhitespace((await snapshotCard.locator(".summary-note").textContent()) ?? "");

    if (
      copy === `${decision.candidateDisplayName} | ${decision.candidateValueLabel}` &&
      summary === `Proposed mapping: ${decision.proposedTitle} | ${decision.proposedCanonicalCode}`
    ) {
      return;
    }

    await section.page().waitForTimeout(200);
  }

  throw new Error(`Timed out waiting for promotion snapshot for ${decision.candidateDisplayName}.`);
}

async function assertPromotionSelectionState(section, expectedDecisionId) {
  const decisionSelect = section.locator("label").filter({ hasText: "Accepted review decision" }).locator("select");
  await waitForInputValue(decisionSelect, expectedDecisionId);
}

function countFlaggedSignals(snapshot) {
  return snapshot.patient.measurements.filter(
    (measurement) => measurement.evidenceStatus === "conflicted" || measurement.evidenceStatus === "watch",
  ).length;
}

function countImprovingSignals(snapshot) {
  return snapshot.patient.measurements.filter((measurement) => measurement.evidenceStatus === "improving").length;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
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

function findReviewTarget(snapshot, predicate) {
  for (const task of snapshot.parseTasks) {
    const candidate = task.candidates.find((entry) => predicate(task, entry));
    if (candidate) {
      return { task, candidate };
    }
  }

  throw new Error("Expected review target was not found in the persisted parse-task snapshot.");
}

function resolveReviewSelection(snapshot, parseTaskId, candidateId) {
  const task = snapshot.parseTasks.find((entry) => entry.id === parseTaskId);
  assert.ok(task, `Parse task ${parseTaskId} should exist.`);

  const candidate = task.candidates.find((entry) => entry.id === candidateId);
  assert.ok(candidate, `Candidate ${candidateId} should exist on parse task ${parseTaskId}.`);

  return { task, candidate };
}

function resolveReviewDecisionBySelection(snapshot, parseTaskId, candidateId) {
  const decision = snapshot.reviewDecisions.find(
    (entry) => entry.parseTaskId === parseTaskId && entry.candidateId === candidateId,
  );
  assert.ok(decision, `Review decision for parse task ${parseTaskId} candidate ${candidateId} should exist.`);
  return decision;
}

function discoverReviewCoverageTargets(snapshot, csvFilenames) {
  const candidateGroups = snapshot.parseTasks
    .filter((task) => task.parser === "csv_table" && csvFilenames.has(task.sourceDocumentFilename))
    .map((task) => ({
      parseTaskId: task.id,
      sourceFilename: task.sourceDocumentFilename,
      candidates: task.candidates
        .filter(
          (candidate) => candidate.numericValue !== undefined && Boolean(resolveCanonicalCodeForName(candidate.displayName)),
        )
        .map((candidate) => ({
          parseTaskId: task.id,
          candidateId: candidate.id,
          sourceFilename: task.sourceDocumentFilename,
          candidateDisplayName: candidate.displayName,
          proposedCanonicalCode: resolveCanonicalCodeForName(candidate.displayName),
        }))
        .sort((left, right) => left.candidateDisplayName.localeCompare(right.candidateDisplayName)),
    }))
    .filter((task) => task.candidates.length > 0)
    .sort((left, right) => left.sourceFilename.localeCompare(right.sourceFilename));

  let reservedGroup = null;
  for (const candidateGroup of candidateGroups) {
    if (candidateGroup.candidates.length < 2) {
      continue;
    }

    const remainingCandidateCount = candidateGroups
      .filter((entry) => entry.parseTaskId !== candidateGroup.parseTaskId)
      .reduce((count, entry) => count + entry.candidates.length, 0);

    if (remainingCandidateCount >= 5) {
      reservedGroup = candidateGroup;
      break;
    }
  }

  assert.ok(reservedGroup, "UI review coverage requires one reserved CSV task plus five promotable candidates elsewhere.");

  const acceptedReviewTargets = candidateGroups
    .filter((candidateGroup) => candidateGroup.parseTaskId !== reservedGroup.parseTaskId)
    .flatMap((candidateGroup) => candidateGroup.candidates)
    .slice(0, 5)
    .map((target, index) => ({
      ...target,
      reviewerName: `UI clinician ${index + 1}`,
      note: `${target.candidateDisplayName} review kept for promotion overflow coverage.`,
    }));

  assert.equal(acceptedReviewTargets.length, 5, "UI review coverage requires five promotable accepted targets.");

  const nonAcceptCandidates = reservedGroup.candidates.slice(0, 2);
  assert.equal(nonAcceptCandidates.length, 2, "UI review coverage requires two reserved non-accept targets.");

  const nonAcceptReviewTargets = [
    {
      ...nonAcceptCandidates[0],
      action: "reject",
      stagedCanonicalCode: nonAcceptCandidates[0].proposedCanonicalCode,
      reviewerName: "UI clinician reject",
      note: "Rejected during overflow coverage to prove non-promotable review behavior.",
    },
    {
      ...nonAcceptCandidates[1],
      action: "follow_up",
      reviewerName: "UI clinician follow-up",
      note: "Flagged for follow-up during overflow coverage to prove non-accept review behavior.",
    },
  ];

  return { acceptedReviewTargets, nonAcceptReviewTargets };
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

function topLevelSourceDocuments(snapshot) {
  return snapshot.sourceDocuments.filter((document) => !document.parentDocumentId).slice(0, 4);
}

function childSourceDocuments(snapshot) {
  return snapshot.sourceDocuments.filter((document) => document.parentDocumentId).slice(0, 4);
}

function reviewCountsByTask(snapshot) {
  return snapshot.reviewDecisions.reduce((counts, decision) => {
    counts[decision.parseTaskId] = (counts[decision.parseTaskId] ?? 0) + 1;
    return counts;
  }, {});
}

function pendingPromotionDecisions(snapshot) {
  const promotedDecisionIds = new Set(snapshot.measurementPromotions.map((promotion) => promotion.reviewDecisionId));
  const promotableCandidateKeys = new Set(
    snapshot.parseTasks.flatMap((task) =>
      task.candidates
        .filter((candidate) => candidate.numericValue !== undefined)
        .map((candidate) => `${task.id}:${candidate.id}`),
    ),
  );
  return snapshot.reviewDecisions.filter(
    (decision) =>
      decision.action === "accept" &&
      decision.proposedCanonicalCode &&
      promotableCandidateKeys.has(`${decision.parseTaskId}:${decision.candidateId}`) &&
      !promotedDecisionIds.has(decision.id),
  );
}

function editableReviewTasks(snapshot) {
  const promotedDecisionIds = new Set(snapshot.measurementPromotions.map((promotion) => promotion.reviewDecisionId));
  const promotedCandidateKeys = new Set(
    snapshot.reviewDecisions
      .filter((decision) => promotedDecisionIds.has(decision.id))
      .map((decision) => `${decision.parseTaskId}:${decision.candidateId}`),
  );

  return snapshot.parseTasks
    .map((task) => ({
      ...task,
      candidates: task.candidates.filter((candidate) => !promotedCandidateKeys.has(`${task.id}:${candidate.id}`)),
    }))
    .filter((task) => task.candidates.length > 0);
}

function resolveEditableReviewSelection(snapshot, taskId, candidateId) {
  const task = editableReviewTasks(snapshot).find((entry) => entry.id === taskId);
  assert.ok(task, `Editable review task ${taskId} should exist.`);

  const candidate = task.candidates.find((entry) => entry.id === candidateId);
  assert.ok(candidate, `Editable review candidate ${candidateId} should exist on task ${taskId}.`);

  return { task, candidate };
}

async function assertSignalCardsMatchSnapshot(section, snapshot) {
  const expectedSignals = snapshot.patient.measurements.slice(0, 3);
  const cards = section.locator(".signal-card");
  assert.equal(await cards.count(), expectedSignals.length);

  for (const [index, measurement] of expectedSignals.entries()) {
    const card = cards.nth(index);
    assert.equal((await card.locator(".signal-title").textContent())?.trim(), measurement.title);
    assert.equal((await card.locator(".signal-meta .pill").first().textContent())?.trim(), measurement.evidenceStatus);

    const sourceText = normalizeWhitespace((await card.locator(".signal-source").textContent()) ?? "");
    assert.ok(sourceText.includes(measurement.sourceVendor));
    assert.ok(sourceText.toLowerCase().includes(measurement.modality));

    assert.equal(
      (await card.locator(".signal-value").textContent())?.trim(),
      `${measurement.value}${measurement.unit ? ` ${measurement.unit}` : ""}`,
    );

    if (measurement.deltaLabel) {
      assert.equal((await card.locator(".signal-delta").textContent())?.trim(), measurement.deltaLabel);
    } else {
      assert.equal(await card.locator(".signal-delta").count(), 0);
    }

    const footText = normalizeWhitespace((await card.locator(".signal-foot").textContent()) ?? "");
    assert.ok(footText.includes(measurement.interpretation));
    assert.ok(footText.includes(`${measurement.confidenceLabel} confidence`));
  }
}

async function assertSourceDocumentsMatchSnapshot(section, snapshot) {
  const topLevelDocuments = topLevelSourceDocuments(snapshot);
  const childDocuments = childSourceDocuments(snapshot);
  const childCounts = snapshot.sourceDocuments.reduce((counts, document) => {
    if (document.parentDocumentId) {
      counts[document.parentDocumentId] = (counts[document.parentDocumentId] ?? 0) + 1;
    }
    return counts;
  }, {});

  if (snapshot.sourceDocuments.length === 0) {
    await section.getByText("No uploads yet", { exact: true }).waitFor();
    return;
  }

  const topLevelCards = section.locator("xpath=.//div[contains(@class,'detail-stack')][1]/article[contains(@class,'detail-card')]");
  assert.equal(await topLevelCards.count(), topLevelDocuments.length);

  for (const [index, document] of topLevelDocuments.entries()) {
    const card = topLevelCards.nth(index);
    assert.equal((await card.locator(".detail-label").first().textContent())?.trim(), document.classification);
    assert.equal((await card.locator(".signal-title").textContent())?.trim(), document.originalFilename);
    assert.equal((await card.locator(".pill").first().textContent())?.trim(), document.status);

    const summaryText = normalizeWhitespace((await card.locator(".summary-note").textContent()) ?? "");
    assert.ok(summaryText.includes(document.sourceSystem));
    assert.ok(summaryText.includes(formatDate(document.receivedAt)));
    assert.ok(summaryText.includes(`${document.byteSize} bytes`));

    const detailText = normalizeWhitespace((await card.locator(".detail-copy").textContent()) ?? "");
    if (document.archiveEntries?.length) {
      assert.equal(
        detailText,
        `${document.archiveEntries.length} archive entries indexed, ${childCounts[document.id] ?? 0} extracted child documents.`,
      );
    } else {
      assert.equal(detailText, `Stored at ${document.relativePath} with checksum tracking ready for provenance.`);
    }
  }

  if (childDocuments.length === 0) {
    assert.equal(await section.getByText("Recent extracted children", { exact: true }).count(), 0);
    return;
  }

  await section.getByText("Recent extracted children", { exact: true }).waitFor();
  const childCards = section.locator("xpath=.//div[contains(@class,'detail-stack')][2]/article[contains(@class,'detail-card')]");
  assert.equal(await childCards.count(), childDocuments.length);

  for (const [index, document] of childDocuments.entries()) {
    const card = childCards.nth(index);
    assert.equal((await card.locator(".signal-title").textContent())?.trim(), document.originalFilename);
    assert.equal((await card.locator(".summary-note").textContent())?.trim(), document.archiveEntryPath);
    assert.equal((await card.locator(".pill").first().textContent())?.trim(), document.classification);
  }
}

async function assertParseTasksMatchSnapshot(section, snapshot) {
  const expectedTasks = snapshot.parseTasks.slice(0, 5);
  const reviewCounts = reviewCountsByTask(snapshot);

  if (snapshot.parseTasks.length === 0) {
    await section.getByText("No parse tasks yet", { exact: true }).waitFor();
    return;
  }

  const taskCards = section.locator("xpath=.//div[contains(@class,'detail-stack')][1]/article[contains(@class,'detail-card')]");
  assert.equal(await taskCards.count(), expectedTasks.length);

  for (const [index, task] of expectedTasks.entries()) {
    const card = taskCards.nth(index);
    assert.equal((await card.locator(".detail-label").first().textContent())?.trim(), task.parser);
    assert.equal((await card.locator(".signal-meta .signal-title").first().textContent())?.trim(), task.sourceDocumentFilename);
    assert.equal((await card.locator(".pill").first().textContent())?.trim(), task.status);

    const summaryNotes = card.locator(".summary-note");
    const metaSummary = normalizeWhitespace((await summaryNotes.nth(0).textContent()) ?? "");
    assert.ok(metaSummary.includes(task.mode));
    assert.ok(metaSummary.includes(formatDate(task.updatedAt)));
    assert.ok(metaSummary.includes(`${task.candidateCount} candidates`));
    assert.ok(metaSummary.includes(`${reviewCounts[task.id] ?? 0} reviewed`));

    assert.equal((await card.locator(".detail-copy").first().textContent())?.trim(), task.summary);
    assert.equal((await summaryNotes.nth(1).textContent())?.trim(), task.detail);

    const expectedMetadata = task.metadata.slice(0, 3);
    for (const metadataItem of expectedMetadata) {
      const metadataCard = card
        .getByText(metadataItem.label, { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'detail-card')][1]");
      await metadataCard.waitFor();
      assert.equal((await metadataCard.locator(".detail-label").textContent())?.trim(), metadataItem.label);
      assert.equal((await metadataCard.locator(".detail-copy").textContent())?.trim(), metadataItem.value);
    }

    const expectedCandidates = task.candidates.slice(0, 3);
    if (expectedCandidates.length === 0) {
      assert.equal(await card.getByText("Candidate values", { exact: true }).count(), 0);
      continue;
    }

    await card.getByText("Candidate values", { exact: true }).waitFor();
    for (const candidate of expectedCandidates) {
      const candidateCard = card
        .getByText(candidate.displayName, { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'detail-card')][1]");
      await candidateCard.waitFor();
      assert.equal((await candidateCard.locator(".signal-title").textContent())?.trim(), candidate.displayName);
      assert.equal((await candidateCard.locator(".pill").first().textContent())?.trim(), candidate.valueLabel);
      assert.equal((await candidateCard.locator(".summary-note").textContent())?.trim(), candidate.sourcePath);

      const detailCopyCount = await candidateCard.locator(".detail-copy").count();
      const hasDetailCopy = Boolean(candidate.loincCode || candidate.referenceRange);
      assert.equal(detailCopyCount > 0, hasDetailCopy);
      if (hasDetailCopy) {
        const detailText = normalizeWhitespace((await candidateCard.locator(".detail-copy").textContent()) ?? "");
        if (candidate.loincCode) {
          assert.ok(detailText.includes(`LOINC ${candidate.loincCode}`));
        }
        if (candidate.referenceRange) {
          assert.ok(detailText.includes(candidate.referenceRange));
        }
      }
    }
  }
}

async function assertTimelineMatchesSnapshot(section, snapshot) {
  const items = section.locator(".timeline-item");
  assert.equal(await items.count(), snapshot.patient.timeline.length);

  for (const [index, event] of snapshot.patient.timeline.entries()) {
    const item = items.nth(index);
    assert.equal((await item.locator(".timeline-date").textContent())?.trim(), formatDate(event.occurredAt));
    assert.equal((await item.locator(".timeline-title").textContent())?.trim(), event.title);
    assert.equal((await item.locator(".timeline-copy").textContent())?.trim(), event.detail);
  }
}

async function assertRecentDecisionsMatchSnapshot(section, snapshot) {
  const expectedDecisions = snapshot.reviewDecisions.slice(0, 4);
  if (expectedDecisions.length === 0) {
    assert.equal(await section.getByText("Recent decisions", { exact: true }).count(), 0);
    return;
  }

  await section.getByText("Recent decisions", { exact: true }).waitFor();
  const decisionCards = section.locator("xpath=.//div[contains(@class,'detail-stack')][1]/article[contains(@class,'detail-card')]");
  assert.equal(await decisionCards.count(), expectedDecisions.length);

  for (const [index, decision] of expectedDecisions.entries()) {
    const card = decisionCards.nth(index);
    assert.equal((await card.locator(".signal-title").textContent())?.trim(), decision.candidateDisplayName);
    const summaryText = normalizeWhitespace((await card.locator(".summary-note").first().textContent()) ?? "");
    assert.ok(summaryText.includes(decision.reviewerName));
    assert.ok(summaryText.includes(formatDate(decision.updatedAt)));
    assert.equal((await card.locator(".pill").first().textContent())?.trim(), decision.action);
    assert.equal(
      (await card.locator(".detail-copy").textContent())?.trim(),
      `${decision.candidateValueLabel}${decision.proposedTitle ? ` -> ${decision.proposedTitle}` : ""}`,
    );
    if (decision.note) {
      assert.equal((await card.locator(".summary-note").nth(1).textContent())?.trim(), decision.note);
    } else {
      assert.equal(await card.locator(".summary-note").count(), 1);
    }
  }
}

async function assertRecentPromotionsMatchSnapshot(section, snapshot) {
  const expectedPromotions = snapshot.measurementPromotions.slice(0, 4);
  if (expectedPromotions.length === 0) {
    assert.equal(await section.getByText("Recent promotions", { exact: true }).count(), 0);
    return;
  }

  await section.getByText("Recent promotions", { exact: true }).waitFor();
  const promotionCards = section.locator("xpath=.//div[contains(@class,'detail-stack')][1]/article[contains(@class,'detail-card')]");
  assert.equal(await promotionCards.count(), expectedPromotions.length);

  for (const [index, promotion] of expectedPromotions.entries()) {
    const card = promotionCards.nth(index);
    assert.equal((await card.locator(".signal-title").textContent())?.trim(), promotion.title);
    const summaryText = normalizeWhitespace((await card.locator(".summary-note").textContent()) ?? "");
    assert.ok(summaryText.includes(promotion.canonicalCode));
    assert.ok(summaryText.includes(formatDate(promotion.promotedAt)));
    assert.equal((await card.locator(".pill").first().textContent())?.trim(), promotion.modality);
  }
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
  await assertSignalCardsMatchSnapshot(sections.signalBoardSection, snapshot);
  await assertSourceDocumentsMatchSnapshot(sections.sourceDocumentsSection, snapshot);
  await assertParseTasksMatchSnapshot(sections.parseTasksSection, snapshot);
  await assertTimelineMatchesSnapshot(sections.timelineSection, snapshot);
  await assertRecentDecisionsMatchSnapshot(sections.reviewSection, snapshot);
  await assertRecentPromotionsMatchSnapshot(sections.promotionSection, snapshot);
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

function textObservationFixture() {
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

async function zipFixture(prefix) {
  const zip = new JSZip();
  zip.file(`labs/${prefix}-labs.csv`, csvFixture());
  zip.file(
    `notes/${prefix}-note.txt`,
    `${prefix} follow-up note: ApoB trend remains the main target after omega-3 and training changes.`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
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
    const backendErrorWorkbenchHeadings = new Set();
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

    const documentArchives = await Promise.all(
      ["ui-functional-a", "ui-functional-b", "ui-functional-c", "ui-functional-d"].map(async (prefix) => ({
        prefix,
        archiveFilename: `${prefix}.zip`,
        childCsvFilename: `${prefix}-labs.csv`,
        childTextFilename: `${prefix}-note.txt`,
        sourceSystem: `UI functional upload ${prefix.toUpperCase()}`,
        buffer: await zipFixture(prefix),
      })),
    );
    const [firstArchive, ...additionalArchives] = documentArchives;
    const documentBackendErrorSnapshot = await loadPersistedSnapshot();
    await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill(firstArchive.sourceSystem);
    await documentSection.locator('input[type="file"]').setInputFiles({
      name: firstArchive.archiveFilename,
      mimeType: "application/zip",
      buffer: firstArchive.buffer,
    });
    await page.route(
      "**/api/intake/document",
      async (route) => {
        await sleep(1000);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Document intake backend unavailable.",
          }),
        });
      },
      { times: 1 },
    );
    const documentBackendErrorSubmit = documentSection
      .getByRole("button", { name: "Store source document", exact: true })
      .click();
    await assertDocumentSubmittingState(documentSection);
    await documentBackendErrorSubmit;
    await documentSection
      .locator("pre")
      .filter({ hasText: '"error": "Document intake backend unavailable."' })
      .waitFor();
    await assertDocumentDraftState(documentSection, {
      sourceSystem: firstArchive.sourceSystem,
      filePreviewText: firstArchive.archiveFilename,
    });
    backendErrorWorkbenchHeadings.add("Upload a source file");
    await assertUiStateUnchangedAfterError(
      page,
      sections,
      documentBackendErrorSnapshot,
      discoveredWorkbenchHeadings,
    );
    log(
      "document",
      "froze document controls during an in-flight request, then surfaced a backend error without mutating persisted state or dropping the current draft",
    );

    const missingFileDocumentErrorSnapshot = await loadPersistedSnapshot();
    await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
    await documentSection.locator("pre").filter({ hasText: '"error": "Choose a file first."' }).waitFor();
    await assertDocumentDraftState(documentSection, {
      sourceSystem: "Manual clinic upload",
      filePreviewText: null,
    });
    errorWorkbenchHeadings.add("Upload a source file");
    await assertUiStateUnchangedAfterError(
      page,
      sections,
      missingFileDocumentErrorSnapshot,
      discoveredWorkbenchHeadings,
    );
    log("document", "rejected a missing file locally without mutating persisted state");

    const documentErrorSnapshot = await loadPersistedSnapshot();
    await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill("   ");
    await documentSection.locator('input[type="file"]').setInputFiles({
      name: firstArchive.archiveFilename,
      mimeType: "application/zip",
      buffer: firstArchive.buffer,
    });
    await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
    await documentSection.locator("pre").filter({ hasText: '"error": "Choose a source system first."' }).waitFor();
    await assertDocumentDraftState(documentSection, {
      sourceSystem: "   ",
      filePreviewText: firstArchive.archiveFilename,
    });
    errorWorkbenchHeadings.add("Upload a source file");
    await assertUiStateUnchangedAfterError(page, sections, documentErrorSnapshot, discoveredWorkbenchHeadings);
    log("document", "rejected a blank source system locally without mutating persisted state");

    await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill(firstArchive.sourceSystem);
    await documentSection.locator("pre").filter({ hasText: "Document intake output will appear here." }).waitFor();
    log("document", "cleared stale result output when editing document intake inputs");

    await documentSection.getByRole("button", { name: "Reset", exact: true }).click();
    assert.equal(
      await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").inputValue(),
      "Manual clinic upload",
    );
    await documentSection
      .locator(".field-note")
      .filter({ hasText: "Choose a PDF, image, JSON, XML, CSV, XLS/XLSX, TXT, HTML, or ZIP file." })
      .waitFor();
    assert.equal(await documentSection.locator('input[type="file"]').inputValue(), "");
    log("document", "reset the document workbench back to its default source-system and cleared file input state");

    successfulWorkbenchHeadings.add("Upload a source file");
    await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill(firstArchive.sourceSystem);
    await documentSection.locator('input[type="file"]').setInputFiles({
      name: firstArchive.archiveFilename,
      mimeType: "application/zip",
      buffer: firstArchive.buffer,
    });
    await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
    await documentSection.locator("pre").filter({ hasText: `"originalFilename": "${firstArchive.archiveFilename}"` }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await sourceDocumentsSection.getByText(firstArchive.archiveFilename, { exact: true }).waitFor();
    await sourceDocumentsSection.getByText(firstArchive.childCsvFilename, { exact: true }).waitFor();
    await sourceDocumentsSection.getByText(firstArchive.childTextFilename, { exact: true }).waitFor();
    await parseTasksSection.getByText(firstArchive.archiveFilename, { exact: true }).waitFor();
    await parseTasksSection.getByText("archive_manifest", { exact: true }).waitFor();
    await parseTasksSection.getByText(firstArchive.childCsvFilename, { exact: true }).waitFor();
    await parseTasksSection.getByText(firstArchive.childTextFilename, { exact: true }).waitFor();
    for (const archive of additionalArchives) {
      await documentSection.locator("label").filter({ hasText: "Source system" }).locator("input").fill(archive.sourceSystem);
      await documentSection.locator('input[type="file"]').setInputFiles({
        name: archive.archiveFilename,
        mimeType: "application/zip",
        buffer: archive.buffer,
      });
      await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
      await documentSection.locator("pre").filter({ hasText: `"originalFilename": "${archive.archiveFilename}"` }).waitFor();
      await refreshDashboard(page);
      await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
      await sourceDocumentsSection.getByText(archive.archiveFilename, { exact: true }).waitFor();
      await sourceDocumentsSection.getByText(archive.childCsvFilename, { exact: true }).waitFor();
      await sourceDocumentsSection.getByText(archive.childTextFilename, { exact: true }).waitFor();
      await parseTasksSection.getByText(archive.archiveFilename, { exact: true }).waitFor();
      await parseTasksSection.getByText(archive.childCsvFilename, { exact: true }).waitFor();
      await parseTasksSection.getByText(archive.childTextFilename, { exact: true }).waitFor();
    }
    coveredDashboardHeadings.add("Stored source documents");
    coveredDashboardHeadings.add("Document parse tasks");
    const uploadedArchivesSnapshot = await loadPersistedSnapshot();
    const reviewCoverageTargets = discoverReviewCoverageTargets(
      uploadedArchivesSnapshot,
      new Set(documentArchives.map((archive) => archive.childCsvFilename)),
    );
    await assertDashboardMatchesSnapshot(sections, uploadedArchivesSnapshot);
    log("document", "uploaded multiple ZIP archives through the UI and verified extracted-child plus parser-list overflow rendering");

    const parseTaskSelect = reviewSection.locator("select").nth(0);
    const candidateSelect = reviewSection.locator("select").nth(1);
    const nonNumericObservation = {
      filename: "ui-functional-text-observation.json",
      sourceSystem: "UI functional text observation",
      reviewerName: "UI clinician text accept",
      proposedCanonicalCode: "apob",
      note: "Accepted text-valued observation to prove it stays out of the promotion queue.",
    };
    const { acceptedReviewTargets, nonAcceptReviewTargets } = reviewCoverageTargets;
    const firstReviewTarget = acceptedReviewTargets[0];

    await documentSection
      .locator("label")
      .filter({ hasText: "Source system" })
      .locator("input")
      .fill(nonNumericObservation.sourceSystem);
    await documentSection.locator('input[type="file"]').setInputFiles({
      name: nonNumericObservation.filename,
      mimeType: "application/json",
      buffer: textObservationFixture(),
    });
    await documentSection.getByRole("button", { name: "Store source document", exact: true }).click();
    await documentSection
      .locator("pre")
      .filter({ hasText: `"originalFilename": "${nonNumericObservation.filename}"` })
      .waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    await parseTasksSection.getByText(nonNumericObservation.filename, { exact: true }).waitFor();
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());
    log("document", "uploaded a text-valued FHIR observation through the UI for promotion-queue eligibility coverage");

    const reviewErrorSnapshot = await loadPersistedSnapshot();
    const errorReviewTarget = resolveReviewSelection(
      reviewErrorSnapshot,
      firstReviewTarget.parseTaskId,
      firstReviewTarget.candidateId,
    );
    await waitForSelectOptionValue(parseTaskSelect, errorReviewTarget.task.id);
    await parseTaskSelect.selectOption({ value: errorReviewTarget.task.id });
    await waitForSelectOptionValue(candidateSelect, errorReviewTarget.candidate.id);
    await candidateSelect.selectOption({ value: errorReviewTarget.candidate.id });
    await waitForReviewCandidateSnapshot(reviewSection, errorReviewTarget.candidate);
    await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill("   ");
    await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
    await reviewSection
      .locator("pre")
      .filter({ hasText: '"error": "Reviewer name is required."' })
      .waitFor();
    await assertReviewFormState(reviewSection, {
      action: "accept",
      reviewerName: "   ",
      proposedCanonicalCode: "",
      note: "Looks directionally valid. Hold as reviewed candidate before promotion.",
    });
    await waitForReviewCandidateSnapshot(reviewSection, errorReviewTarget.candidate);
    await waitForInputValue(parseTaskSelect, errorReviewTarget.task.id);
    await waitForInputValue(candidateSelect, errorReviewTarget.candidate.id);
    errorWorkbenchHeadings.add("Adjudicate parser candidates");
    await assertUiStateUnchangedAfterError(page, sections, reviewErrorSnapshot, discoveredWorkbenchHeadings);
    log("review", "rejected a blank reviewer locally without mutating persisted state");

    const reviewBackendErrorSnapshot = await loadPersistedSnapshot();
    await waitForSelectOptionValue(parseTaskSelect, errorReviewTarget.task.id);
    await parseTaskSelect.selectOption({ value: errorReviewTarget.task.id });
    await waitForSelectOptionValue(candidateSelect, errorReviewTarget.candidate.id);
    await candidateSelect.selectOption({ value: errorReviewTarget.candidate.id });
    await reviewSection
      .locator("label")
      .filter({ hasText: "Reviewer" })
      .locator("input")
      .fill("UI clinician backend error");
    await reviewSection
      .locator("label")
      .filter({ hasText: "Proposed canonical mapping" })
      .locator("select")
      .selectOption(firstReviewTarget.proposedCanonicalCode);
    await reviewSection
      .locator("label")
      .filter({ hasText: "Note" })
      .locator("textarea")
      .fill("Backend error coverage should preserve the current review draft.");
    await page.route(
      "**/api/review/decision",
      async (route) => {
        await sleep(1000);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Review backend unavailable.",
          }),
        });
      },
      { times: 1 },
    );
    const reviewBackendErrorSubmit = reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
    await assertReviewSubmittingState(reviewSection);
    await reviewBackendErrorSubmit;
    await reviewSection.locator("pre").filter({ hasText: '"error": "Review backend unavailable."' }).waitFor();
    await assertReviewFormState(reviewSection, {
      action: "accept",
      reviewerName: "UI clinician backend error",
      proposedCanonicalCode: firstReviewTarget.proposedCanonicalCode,
      note: "Backend error coverage should preserve the current review draft.",
    });
    await waitForReviewCandidateSnapshot(reviewSection, errorReviewTarget.candidate);
    await waitForInputValue(parseTaskSelect, errorReviewTarget.task.id);
    await waitForInputValue(candidateSelect, errorReviewTarget.candidate.id);
    backendErrorWorkbenchHeadings.add("Adjudicate parser candidates");
    await assertUiStateUnchangedAfterError(page, sections, reviewBackendErrorSnapshot, discoveredWorkbenchHeadings);
    log(
      "review",
      "froze review controls during an in-flight save, then surfaced a backend error without mutating persisted state or dropping the current draft",
    );

    successfulWorkbenchHeadings.add("Adjudicate parser candidates");
    const snapshotBeforeTextReview = await loadPersistedSnapshot();
    const nonNumericReviewTarget = findReviewTarget(
      snapshotBeforeTextReview,
      (task, candidate) =>
        task.sourceDocumentFilename === nonNumericObservation.filename &&
        task.parser === "fhir_resource" &&
        candidate.numericValue === undefined,
    );
    await waitForSelectOptionValue(parseTaskSelect, nonNumericReviewTarget.task.id);
    await parseTaskSelect.selectOption({ value: nonNumericReviewTarget.task.id });
    await waitForSelectOptionValue(candidateSelect, nonNumericReviewTarget.candidate.id);
    await candidateSelect.selectOption({ value: nonNumericReviewTarget.candidate.id });
    await waitForReviewCandidateSnapshot(reviewSection, nonNumericReviewTarget.candidate);
    await reviewSection
      .locator("label")
      .filter({ hasText: "Reviewer" })
      .locator("input")
      .fill(nonNumericObservation.reviewerName);
    await reviewSection
      .locator("label")
      .filter({ hasText: "Proposed canonical mapping" })
      .locator("select")
      .selectOption(nonNumericObservation.proposedCanonicalCode);
    await reviewSection.locator("label").filter({ hasText: "Note" }).locator("textarea").fill(nonNumericObservation.note);
    await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
    await reviewSection
      .locator("pre")
      .filter({ hasText: `"candidateId": "${nonNumericReviewTarget.candidate.id}"` })
      .waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    const afterTextReview = await loadPersistedSnapshot();
    const nonNumericDecision = afterTextReview.reviewDecisions.find(
      (decision) =>
        decision.parseTaskId === nonNumericReviewTarget.task.id && decision.candidateId === nonNumericReviewTarget.candidate.id,
    );
    assert.ok(nonNumericDecision, "Accepted text-valued review decision should persist.");
    assert.equal(nonNumericDecision.proposedCanonicalCode, nonNumericObservation.proposedCanonicalCode);
    assert.equal(pendingPromotionDecisions(afterTextReview).length, 0);
    await promotionSection.getByText("No pending promotions", { exact: true }).waitFor();
    await assertDashboardMatchesSnapshot(sections, afterTextReview);
    log("review", "accepted a text-valued observation and verified it stayed out of the promotion queue");

    await reviewSection.locator("label").filter({ hasText: "Action" }).locator("select").selectOption("reject");
    await reviewSection.locator("pre").filter({ hasText: "Review-decision output will appear here." }).waitFor();
    log("review", "cleared stale result output when editing review form inputs");
    await waitForReviewMappingState(reviewSection, "", true);
    await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill("Unsaved UI reviewer");
    await reviewSection.locator("label").filter({ hasText: "Note" }).locator("textarea").fill("Unsaved UI note");
    await reviewSection.getByRole("button", { name: "Reset demo", exact: true }).click();
    await assertReviewFormState(reviewSection, {
      action: "accept",
      reviewerName: nonNumericObservation.reviewerName,
      proposedCanonicalCode: nonNumericObservation.proposedCanonicalCode,
      note: nonNumericObservation.note,
    });
    assert.equal(await parseTaskSelect.inputValue(), nonNumericReviewTarget.task.id);
    assert.equal(await candidateSelect.inputValue(), nonNumericReviewTarget.candidate.id);
    await assertDashboardMatchesSnapshot(sections, afterTextReview);
    log("review", "reset unsaved review edits back to the persisted decision state without changing selection");

    for (const target of acceptedReviewTargets) {
      const snapshotBeforeReview = await loadPersistedSnapshot();
      const resolvedTarget = resolveReviewSelection(
        snapshotBeforeReview,
        target.parseTaskId,
        target.candidateId,
      );
      await waitForSelectOptionValue(parseTaskSelect, resolvedTarget.task.id);
      await parseTaskSelect.selectOption({ value: resolvedTarget.task.id });
      await waitForSelectOptionValue(candidateSelect, resolvedTarget.candidate.id);
      await candidateSelect.selectOption({ value: resolvedTarget.candidate.id });
      await waitForReviewCandidateSnapshot(reviewSection, resolvedTarget.candidate);
      if (target === acceptedReviewTargets[0]) {
        await reviewSection.locator("pre").filter({ hasText: "Review-decision output will appear here." }).waitFor();
        log("review", "cleared stale result output when switching to a different review target");
      }
      await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill(target.reviewerName);
      await reviewSection
        .locator("label")
        .filter({ hasText: "Proposed canonical mapping" })
        .locator("select")
        .selectOption(target.proposedCanonicalCode);
      await reviewSection.locator("label").filter({ hasText: "Note" }).locator("textarea").fill(target.note);
      await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
      await reviewSection
        .locator("pre")
        .filter({ hasText: `"candidateId": "${resolvedTarget.candidate.id}"` })
        .waitFor();
      await refreshDashboard(page);
      await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    }
    coveredDashboardHeadings.add("Document parse tasks");
    const afterAcceptedReviews = await loadPersistedSnapshot();
    const promotionOptionValuesAfterAcceptedReviews = await readSelectOptionValues(promotionSection.locator("select").first());
    assert.ok(
      !promotionOptionValuesAfterAcceptedReviews.includes(nonNumericDecision.id),
      "Accepted non-numeric decisions should not appear in the promotion queue.",
    );
    await assertDashboardMatchesSnapshot(sections, afterAcceptedReviews);
    log("review", "accepted five parser candidates through the UI and verified recent-decision overflow rendering");

    const promotionSelect = promotionSection.locator("select").first();
    const promotionBackendErrorSnapshot = await loadPersistedSnapshot();
    const promotionErrorDecision = resolveReviewDecisionBySelection(
      promotionBackendErrorSnapshot,
      firstReviewTarget.parseTaskId,
      firstReviewTarget.candidateId,
    );
    await waitForSelectOptionValue(promotionSelect, promotionErrorDecision.id);
    await promotionSelect.selectOption({ value: promotionErrorDecision.id });
    await waitForPromotionSnapshot(promotionSection, promotionErrorDecision);
    await page.route(
      "**/api/review/promote",
      async (route) => {
        await sleep(1000);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Promotion backend unavailable.",
          }),
        });
      },
      { times: 1 },
    );
    const promotionBackendErrorSubmit = promotionSection
      .getByRole("button", { name: "Promote measurement", exact: true })
      .click();
    await assertPromotionSubmittingState(promotionSection);
    await promotionBackendErrorSubmit;
    await promotionSection.locator("pre").filter({ hasText: '"error": "Promotion backend unavailable."' }).waitFor();
    await assertPromotionSelectionState(promotionSection, promotionErrorDecision.id);
    await waitForPromotionSnapshot(promotionSection, promotionErrorDecision);
    backendErrorWorkbenchHeadings.add("Promote accepted decisions");
    await assertUiStateUnchangedAfterError(
      page,
      sections,
      promotionBackendErrorSnapshot,
      discoveredWorkbenchHeadings,
    );
    log(
      "promotion",
      "froze promotion controls during an in-flight request, then surfaced a backend error without mutating persisted state or dropping the current selection",
    );

    const promotionErrorSnapshot = await loadPersistedSnapshot();
    const promotionValidationErrorDecision = resolveReviewDecisionBySelection(
      promotionErrorSnapshot,
      firstReviewTarget.parseTaskId,
      firstReviewTarget.candidateId,
    );
    await waitForSelectOptionValue(promotionSelect, promotionValidationErrorDecision.id);
    await promotionSelect.selectOption({ value: promotionValidationErrorDecision.id });
    await waitForPromotionSnapshot(promotionSection, promotionValidationErrorDecision);
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
    await assertPromotionSelectionState(promotionSection, promotionValidationErrorDecision.id);
    await waitForPromotionSnapshot(promotionSection, promotionValidationErrorDecision);
    errorWorkbenchHeadings.add("Promote accepted decisions");
    await assertUiStateUnchangedAfterError(page, sections, promotionErrorSnapshot, discoveredWorkbenchHeadings);
    log("promotion", "rejected an invalid promotion request without mutating persisted state");

    const promotionOptionValues = await readSelectOptionValues(promotionSelect);
    assert.ok(promotionOptionValues.length > 1, "Promotion reset coverage requires multiple pending decisions.");
    const nonDefaultPromotionDecisionId = promotionOptionValues[promotionOptionValues.length - 1];
    const nonDefaultPromotionDecision = acceptedReviewTargets
      .map((target) => resolveReviewDecisionBySelection(promotionErrorSnapshot, target.parseTaskId, target.candidateId))
      .find((decision) => decision.id === nonDefaultPromotionDecisionId);
    assert.ok(nonDefaultPromotionDecision, "Expected reset coverage decision to resolve from persisted state.");
    await promotionSelect.selectOption({ value: nonDefaultPromotionDecisionId });
    await waitForPromotionSnapshot(promotionSection, nonDefaultPromotionDecision);
    await promotionSection.locator("pre").filter({ hasText: "Promotion output will appear here." }).waitFor();
    log("promotion", "cleared stale result output when switching to a different pending decision");
    await promotionSection.getByRole("button", { name: "Reset demo", exact: true }).click();
    assert.equal(await promotionSelect.inputValue(), promotionOptionValues[0]);
    await waitForPromotionSnapshot(promotionSection, promotionValidationErrorDecision);
    await promotionSection.locator("pre").filter({ hasText: "Promotion output will appear here." }).waitFor();
    await assertDashboardMatchesSnapshot(sections, promotionErrorSnapshot);
    log("promotion", "reset the promotion workbench back to the first pending decision and cleared local result state");

    successfulWorkbenchHeadings.add("Promote accepted decisions");
    for (const [index, target] of acceptedReviewTargets.entries()) {
      const snapshotBeforePromotion = await loadPersistedSnapshot();
      const decision = resolveReviewDecisionBySelection(
        snapshotBeforePromotion,
        target.parseTaskId,
        target.candidateId,
      );
      await waitForSelectOptionValue(promotionSelect, decision.id);
      await promotionSelect.selectOption({ value: decision.id });
      await waitForPromotionSnapshot(promotionSection, decision);
      await promotionSection.getByRole("button", { name: "Promote measurement", exact: true }).click();
      if (index < acceptedReviewTargets.length - 1) {
        const remainingPromotionOptionValues = await waitForSelectOptionValueToDisappear(promotionSelect, decision.id);
        if (index === 0) {
          const afterFirstPromotion = await loadPersistedSnapshot();
          const remainingPendingDecisions = pendingPromotionDecisions(afterFirstPromotion);
          assert.ok(remainingPendingDecisions.length > 0, "Promotion retarget coverage requires remaining pending decisions.");
          assert.equal(
            await promotionSelect.inputValue(),
            remainingPromotionOptionValues[0],
            "Promotion workbench should retarget to the first remaining pending decision.",
          );
          const autoSelectedDecision = remainingPendingDecisions.find(
            (entry) => entry.id === remainingPromotionOptionValues[0],
          );
          assert.ok(autoSelectedDecision, "Auto-selected promotion decision should resolve from persisted state.");
          await waitForPromotionSnapshot(promotionSection, autoSelectedDecision);
          log("promotion", "retargeted the promotion workbench to the next pending decision after removing the current one");
        }
      } else {
        await promotionSection.getByText("No pending promotions", { exact: true }).waitFor();
      }
      if (index === 0) {
      }
      await refreshDashboard(page);
      await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    }
    coveredDashboardHeadings.add("Interventions and evidence windows");
    coveredDashboardHeadings.add("Modality-aware evidence cards");
    await assertDashboardMatchesSnapshot(sections, await loadPersistedSnapshot());
    log("promotion", "promoted five accepted decisions through the UI and verified recent-promotion overflow rendering");

    for (const target of nonAcceptReviewTargets) {
      const snapshotBeforeReview = await loadPersistedSnapshot();
      const resolvedTarget = resolveReviewSelection(
        snapshotBeforeReview,
        target.parseTaskId,
        target.candidateId,
      );
      await waitForSelectOptionValue(parseTaskSelect, resolvedTarget.task.id);
      await parseTaskSelect.selectOption({ value: resolvedTarget.task.id });
      await waitForSelectOptionValue(candidateSelect, resolvedTarget.candidate.id);
      await candidateSelect.selectOption({ value: resolvedTarget.candidate.id });
      if (target.stagedCanonicalCode) {
        await reviewSection
          .locator("label")
          .filter({ hasText: "Proposed canonical mapping" })
          .locator("select")
          .selectOption(target.stagedCanonicalCode);
      }
      await reviewSection.locator("label").filter({ hasText: "Action" }).locator("select").selectOption(target.action);
      if (target.stagedCanonicalCode) {
        await waitForReviewMappingState(reviewSection, "", true);
      }
      await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill(target.reviewerName);
      await reviewSection.locator("label").filter({ hasText: "Note" }).locator("textarea").fill(target.note);
      await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
      await reviewSection
        .locator("pre")
        .filter({ hasText: `"candidateId": "${resolvedTarget.candidate.id}"` })
        .waitFor();
      await refreshDashboard(page);
      await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    }
    await promotionSection.getByText("No pending promotions", { exact: true }).waitFor();
    const afterNonAcceptReviews = await loadPersistedSnapshot();
    assert.ok(afterNonAcceptReviews.reviewDecisions.some((decision) => decision.action === "reject"));
    assert.ok(afterNonAcceptReviews.reviewDecisions.some((decision) => decision.action === "follow_up"));
    assert.equal(pendingPromotionDecisions(afterNonAcceptReviews).length, 0);
    await assertDashboardMatchesSnapshot(sections, afterNonAcceptReviews);
    log("review", "saved reject and follow-up decisions through the UI and verified the promotion queue emptied");

    const reviewUpdateTarget = nonAcceptReviewTargets[0];
    const beforeReviewUpdate = await loadPersistedSnapshot();
    const existingReviewDecision = resolveReviewDecisionBySelection(
      beforeReviewUpdate,
      reviewUpdateTarget.parseTaskId,
      reviewUpdateTarget.candidateId,
    );
    const reviewDecisionCountBeforeUpdate = beforeReviewUpdate.reviewDecisions.length;
    const resolvedUpdateTarget = resolveReviewSelection(
      beforeReviewUpdate,
      reviewUpdateTarget.parseTaskId,
      reviewUpdateTarget.candidateId,
    );
    await waitForSelectOptionValue(parseTaskSelect, resolvedUpdateTarget.task.id);
    await parseTaskSelect.selectOption({ value: resolvedUpdateTarget.task.id });
    await waitForSelectOptionValue(candidateSelect, resolvedUpdateTarget.candidate.id);
    await candidateSelect.selectOption({ value: resolvedUpdateTarget.candidate.id });
    await assertReviewFormState(reviewSection, {
      action: existingReviewDecision.action,
      reviewerName: existingReviewDecision.reviewerName,
      proposedCanonicalCode: existingReviewDecision.proposedCanonicalCode ?? "",
      note: existingReviewDecision.note ?? "",
    });
    await reviewSection.locator("label").filter({ hasText: "Action" }).locator("select").selectOption("accept");
    await reviewSection.locator("label").filter({ hasText: "Reviewer" }).locator("input").fill("UI clinician reopened");
    await reviewSection
      .locator("label")
      .filter({ hasText: "Proposed canonical mapping" })
      .locator("select")
      .selectOption("apob");
    await reviewSection
      .locator("label")
      .filter({ hasText: "Note" })
      .locator("textarea")
      .fill("Reopened the prior reject decision to verify UI update semantics and queue recovery.");
    await reviewSection.getByRole("button", { name: "Save review decision", exact: true }).click();
    await reviewSection
      .locator("pre")
      .filter({ hasText: `"candidateId": "${resolvedUpdateTarget.candidate.id}"` })
      .waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);

    const afterReviewUpdate = await loadPersistedSnapshot();
    const updatedReviewDecision = resolveReviewDecisionBySelection(
      afterReviewUpdate,
      reviewUpdateTarget.parseTaskId,
      reviewUpdateTarget.candidateId,
    );
    assert.equal(afterReviewUpdate.reviewDecisions.length, reviewDecisionCountBeforeUpdate);
    assert.equal(updatedReviewDecision.id, existingReviewDecision.id);
    assert.equal(updatedReviewDecision.action, "accept");
    assert.equal(updatedReviewDecision.proposedCanonicalCode, "apob");
    assert.equal(updatedReviewDecision.reviewerName, "UI clinician reopened");
    const reopenedPendingPromotions = pendingPromotionDecisions(afterReviewUpdate);
    assert.equal(reopenedPendingPromotions.length, 1);
    assert.equal(reopenedPendingPromotions[0].id, updatedReviewDecision.id);
    await waitForSelectOptionValue(parseTaskSelect, resolvedUpdateTarget.task.id);
    await parseTaskSelect.selectOption({ value: resolvedUpdateTarget.task.id });
    await waitForSelectOptionValue(candidateSelect, resolvedUpdateTarget.candidate.id);
    await candidateSelect.selectOption({ value: resolvedUpdateTarget.candidate.id });
    await assertReviewFormState(reviewSection, {
      action: updatedReviewDecision.action,
      reviewerName: updatedReviewDecision.reviewerName,
      proposedCanonicalCode: updatedReviewDecision.proposedCanonicalCode ?? "",
      note: updatedReviewDecision.note ?? "",
    });
    await waitForSelectOptionValue(promotionSelect, updatedReviewDecision.id);
    await assertDashboardMatchesSnapshot(sections, afterReviewUpdate);
    log("review", "updated an existing rejected decision into an accepted one, reloaded the saved form state, and verified the pending promotion queue recovered");

    const promotionCountBeforeReopenedPromotion = afterReviewUpdate.measurementPromotions.length;
    await promotionSelect.selectOption({ value: updatedReviewDecision.id });
    await promotionSection.getByRole("button", { name: "Promote measurement", exact: true }).click();
    await promotionSection.getByText("No pending promotions", { exact: true }).waitFor();
    await refreshDashboard(page);
    await mergeDiscoveredWorkbenchHeadings(page, discoveredWorkbenchHeadings);
    const afterReviewUpdatePromotion = await loadPersistedSnapshot();
    assert.equal(afterReviewUpdatePromotion.reviewDecisions.length, reviewDecisionCountBeforeUpdate);
    assert.equal(afterReviewUpdatePromotion.measurementPromotions.length, promotionCountBeforeReopenedPromotion + 1);
    assert.equal(pendingPromotionDecisions(afterReviewUpdatePromotion).length, 0);
    await assertDashboardMatchesSnapshot(sections, afterReviewUpdatePromotion);
    log("promotion", "promoted the reopened decision and verified the queue emptied again without duplicating review records");

    await waitForSelectOptionValue(parseTaskSelect, resolvedUpdateTarget.task.id);
    await parseTaskSelect.selectOption({ value: resolvedUpdateTarget.task.id });
    const remainingCandidateValues = await waitForSelectOptionValueToDisappear(
      candidateSelect,
      resolvedUpdateTarget.candidate.id,
    );
    assert.ok(
      !remainingCandidateValues.includes(resolvedUpdateTarget.candidate.id),
      "Promoted candidates should disappear from the editable review queue.",
    );
    assert.ok(remainingCandidateValues.length > 0, "The review workbench should still expose other editable candidates.");
    const autoSelectedTaskId = await parseTaskSelect.inputValue();
    const autoSelectedCandidateId = await candidateSelect.inputValue();
    assert.equal(
      autoSelectedCandidateId,
      remainingCandidateValues[0],
      "Review workbench should retarget to the first remaining editable candidate.",
    );
    const autoSelectedReview = resolveEditableReviewSelection(
      afterReviewUpdatePromotion,
      autoSelectedTaskId,
      autoSelectedCandidateId,
    );
    await waitForReviewCandidateSnapshot(reviewSection, autoSelectedReview.candidate);
    const autoSelectedDecision = afterReviewUpdatePromotion.reviewDecisions.find(
      (decision) =>
        decision.parseTaskId === autoSelectedTaskId && decision.candidateId === autoSelectedCandidateId,
    );
    await assertReviewFormState(reviewSection, {
      action: autoSelectedDecision?.action ?? "accept",
      reviewerName: autoSelectedDecision?.reviewerName ?? "Demo clinician",
      proposedCanonicalCode: autoSelectedDecision?.proposedCanonicalCode ?? "",
      note:
        autoSelectedDecision?.note ??
        "Looks directionally valid. Hold as reviewed candidate before promotion.",
    });
    await assertDashboardMatchesSnapshot(sections, afterReviewUpdatePromotion);
    log("review", "removed the promoted candidate from the editable review queue and retargeted to the next editable record");

    const reportBackendErrorSnapshot = await loadPersistedSnapshot();
    await reportSection.locator("label").filter({ hasText: "Vendor" }).locator("select").selectOption("Hurdle");
    await reportSection
      .locator("label")
      .filter({ hasText: "Entries JSON" })
      .locator("textarea")
      .fill('[{"name":"Backend coverage marker","value":1}]');
    await page.route(
      "**/api/intake/report",
      async (route) => {
        await sleep(1000);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Report intake backend unavailable.",
          }),
        });
      },
      { times: 1 },
    );
    const reportBackendErrorSubmit = reportSection.getByRole("button", { name: "Run normalization", exact: true }).click();
    await assertReportSubmittingState(reportSection);
    await reportBackendErrorSubmit;
    await reportSection
      .locator("pre")
      .filter({ hasText: '"error": "Report intake backend unavailable."' })
      .waitFor();
    await assertReportDraftState(reportSection, {
      vendor: "Hurdle",
      payloadText: '[{"name":"Backend coverage marker","value":1}]',
    });
    backendErrorWorkbenchHeadings.add("Report intake and normalization");
    await assertUiStateUnchangedAfterError(page, sections, reportBackendErrorSnapshot, discoveredWorkbenchHeadings);
    log(
      "report",
      "froze report controls during an in-flight request, then surfaced a backend error without mutating persisted state or dropping the current draft",
    );

    const reportJsonErrorSnapshot = await loadPersistedSnapshot();
    await reportSection.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea").fill("{");
    await reportSection.getByRole("button", { name: "Run normalization", exact: true }).click();
    await reportSection
      .locator("pre")
      .filter({ hasText: '"error": "Entries JSON must be valid JSON."' })
      .waitFor();
    await assertReportDraftState(reportSection, {
      vendor: "TruDiagnostic",
      payloadText: "{",
    });
    errorWorkbenchHeadings.add("Report intake and normalization");
    await assertUiStateUnchangedAfterError(page, sections, reportJsonErrorSnapshot, discoveredWorkbenchHeadings);
    log("report", "rejected malformed JSON locally without mutating persisted state");

    const reportErrorSnapshot = await loadPersistedSnapshot();
    await reportSection.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea").fill('{"not":"an array"}');
    await reportSection.getByRole("button", { name: "Run normalization", exact: true }).click();
    await reportSection.locator("pre").filter({ hasText: '"error": "Entries JSON must be an array."' }).waitFor();
    await assertReportDraftState(reportSection, {
      vendor: "TruDiagnostic",
      payloadText: '{"not":"an array"}',
    });
    await assertUiStateUnchangedAfterError(page, sections, reportErrorSnapshot, discoveredWorkbenchHeadings);
    log("report", "rejected a non-array entries payload locally without mutating persisted state");

    await reportSection.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea").fill('[{"name":"Edited value","value":1}]');
    await reportSection.locator("pre").filter({ hasText: "Normalization output will appear here." }).waitFor();
    log("report", "cleared stale result output when editing report intake inputs");

    await reportSection.locator("label").filter({ hasText: "Vendor" }).locator("select").selectOption("Quest panel via Terra parser");
    await reportSection.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea").fill('[{"name":"Temporary value","value":1}]');
    await reportSection.getByRole("button", { name: "Reset demo", exact: true }).click();
    assert.equal(
      await reportSection.locator("label").filter({ hasText: "Vendor" }).locator("select").inputValue(),
      "TruDiagnostic",
    );
    assert.equal(
      await reportSection.locator("label").filter({ hasText: "Entries JSON" }).locator("textarea").inputValue(),
      JSON.stringify(
        [
          { name: "OMICmAge", value: 45.1, unit: "years" },
          { name: "DunedinPACE", value: 0.91 },
          { name: "CRP", value: 1.4, unit: "mg/L" },
          { name: "Unknown vendor score", value: 72 },
        ],
        null,
        2,
      ),
    );
    await reportSection.locator("pre").filter({ hasText: "Normalization output will appear here." }).waitFor();
    await assertDashboardMatchesSnapshot(sections, reportErrorSnapshot);
    log("report", "reset the report workbench back to its demo vendor, entries payload, and cleared result state");

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

    const interventionBackendErrorSnapshot = await loadPersistedSnapshot();
    await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").fill("UI backend intervention");
    await interventionSection.locator("label").filter({ hasText: "Date" }).locator("input").fill("2026-04-06");
    await interventionSection
      .locator("label")
      .filter({ hasText: "Detail" })
      .locator("textarea")
      .fill("Backend error coverage should preserve this intervention draft.");
    await page.route(
      "**/api/intake/intervention",
      async (route) => {
        await sleep(1000);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Intervention backend unavailable.",
          }),
        });
      },
      { times: 1 },
    );
    const interventionBackendErrorSubmit = interventionSection
      .getByRole("button", { name: "Save intervention", exact: true })
      .click();
    await assertInterventionSubmittingState(interventionSection);
    await interventionBackendErrorSubmit;
    await interventionSection
      .locator("pre")
      .filter({ hasText: '"error": "Intervention backend unavailable."' })
      .waitFor();
    await assertInterventionDraftState(interventionSection, {
      title: "UI backend intervention",
      occurredAt: "2026-04-06",
      detail: "Backend error coverage should preserve this intervention draft.",
    });
    backendErrorWorkbenchHeadings.add("Tag a protocol change");
    await assertUiStateUnchangedAfterError(
      page,
      sections,
      interventionBackendErrorSnapshot,
      discoveredWorkbenchHeadings,
    );
    log(
      "intervention",
      "froze intervention controls during an in-flight request, then surfaced a backend error without mutating persisted state or dropping the current draft",
    );

    const interventionDateErrorSnapshot = await loadPersistedSnapshot();
    await interventionSection.locator("label").filter({ hasText: "Date" }).locator("input").fill("");
    await interventionSection.getByRole("button", { name: "Save intervention", exact: true }).click();
    await interventionSection
      .locator("pre")
      .filter({ hasText: '"error": "Choose a valid date first."' })
      .waitFor();
    await assertInterventionDraftState(interventionSection, {
      title: "Omega-3 dose increased",
      occurredAt: "",
      detail: "Raised EPA/DHA intake and paired with repeat inflammation review in 60 days.",
    });
    errorWorkbenchHeadings.add("Tag a protocol change");
    await assertUiStateUnchangedAfterError(page, sections, interventionDateErrorSnapshot, discoveredWorkbenchHeadings);
    log("intervention", "rejected a blank intervention date locally without mutating persisted state");

    const interventionTitleErrorSnapshot = await loadPersistedSnapshot();
    await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").fill("   ");
    await interventionSection.getByRole("button", { name: "Save intervention", exact: true }).click();
    await interventionSection.locator("pre").filter({ hasText: '"error": "Title is required."' }).waitFor();
    await assertInterventionDraftState(interventionSection, {
      title: "   ",
      occurredAt: "2026-04-04",
      detail: "Raised EPA/DHA intake and paired with repeat inflammation review in 60 days.",
    });
    await assertUiStateUnchangedAfterError(page, sections, interventionTitleErrorSnapshot, discoveredWorkbenchHeadings);
    log("intervention", "rejected a blank intervention title locally without mutating persisted state");

    const interventionDetailErrorSnapshot = await loadPersistedSnapshot();
    await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").fill("UI intervention checkpoint");
    await interventionSection
      .locator("label")
      .filter({ hasText: "Detail" })
      .locator("textarea")
      .fill("   ");
    await interventionSection.getByRole("button", { name: "Save intervention", exact: true }).click();
    await interventionSection.locator("pre").filter({ hasText: '"error": "Detail is required."' }).waitFor();
    await assertInterventionDraftState(interventionSection, {
      title: "UI intervention checkpoint",
      occurredAt: "2026-04-04",
      detail: "   ",
    });
    await assertUiStateUnchangedAfterError(page, sections, interventionDetailErrorSnapshot, discoveredWorkbenchHeadings);
    log("intervention", "rejected a blank intervention detail locally without mutating persisted state");

    await interventionSection
      .locator("label")
      .filter({ hasText: "Detail" })
      .locator("textarea")
      .fill("Edited intervention detail");
    await interventionSection.locator("pre").filter({ hasText: "Intervention save output will appear here." }).waitFor();
    log("intervention", "cleared stale result output when editing intervention inputs");

    await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").fill("Temporary intervention title");
    await interventionSection.locator("label").filter({ hasText: "Date" }).locator("input").fill("2026-03-20");
    await interventionSection
      .locator("label")
      .filter({ hasText: "Detail" })
      .locator("textarea")
      .fill("Temporary intervention detail");
    await interventionSection.getByRole("button", { name: "Reset demo", exact: true }).click();
    assert.equal(
      await interventionSection.locator("label").filter({ hasText: "Title" }).locator("input").inputValue(),
      "Omega-3 dose increased",
    );
    assert.equal(
      await interventionSection.locator("label").filter({ hasText: "Date" }).locator("input").inputValue(),
      "2026-04-04",
    );
    assert.equal(
      await interventionSection.locator("label").filter({ hasText: "Detail" }).locator("textarea").inputValue(),
      "Raised EPA/DHA intake and paired with repeat inflammation review in 60 days.",
    );
    await interventionSection.locator("pre").filter({ hasText: "Intervention save output will appear here." }).waitFor();
    await assertDashboardMatchesSnapshot(sections, interventionDetailErrorSnapshot);
    log("intervention", "reset the intervention workbench back to its demo title, detail, date, and cleared result state");

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

    documentArchives.forEach((archive) => {
      assert.ok(snapshot.sourceDocuments.some((document) => document.originalFilename === archive.archiveFilename));
      assert.ok(snapshot.sourceDocuments.some((document) => document.originalFilename === archive.childCsvFilename));
      assert.ok(snapshot.sourceDocuments.some((document) => document.originalFilename === archive.childTextFilename));
    });
    assert.ok(snapshot.reviewDecisions.some((decision) => decision.reviewerName.startsWith("UI clinician")));
    assert.ok(snapshot.measurementPromotions.some((promotion) => promotion.canonicalCode === "apob"));
    assert.ok(snapshot.reportIngestions.some((ingestion) => ingestion.vendor === "Hurdle"));
    assert.ok(snapshot.patient.timeline.some((event) => event.title === "UI intervention checkpoint"));
    assert.deepEqual([...successfulWorkbenchHeadings].sort(), [...discoveredWorkbenchHeadings].sort());
    assert.deepEqual([...errorWorkbenchHeadings].sort(), [...discoveredWorkbenchHeadings].sort());
    assert.deepEqual([...backendErrorWorkbenchHeadings].sort(), [...discoveredWorkbenchHeadings].sort());
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
