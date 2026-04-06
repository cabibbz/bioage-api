import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { writeUiArchiveFixtures } from "./lib/ui-archive-fixtures.mjs";

function log(message) {
  console.log(`[ui-parity] ${message}`);
}

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for UI parity testing.");
  }

  return value;
}

async function runSuite(label, scriptPath, envOverrides, reportPath) {
  log(`running ${label} backend browser suite`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        UI_FUNCTIONAL_REPORT_PATH: reportPath,
        ...envOverrides,
      },
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} backend browser suite exited from signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} backend browser suite exited with code ${code}`));
        return;
      }

      resolve(undefined);
    });
  });
}

async function main() {
  requireDatabaseUrl();

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "longevity-ui-parity-"));
  const archiveDir = path.join(tempDir, "archives");
  const fileReportPath = path.join(tempDir, "file-report.json");
  const postgresReportPath = path.join(tempDir, "postgres-report.json");

  try {
    await mkdir(archiveDir, { recursive: true });
    await writeUiArchiveFixtures(archiveDir);

    await runSuite(
      "file",
      "./scripts/ui-functional-file.mjs",
      {
        PERSISTENCE_BACKEND: "file",
        UI_FUNCTIONAL_PORT: process.env.UI_PARITY_FILE_PORT?.trim() || "3160",
        UI_FUNCTIONAL_ARCHIVE_DIR: archiveDir,
      },
      fileReportPath,
    );

    await runSuite(
      "postgres",
      "./scripts/ui-functional-postgres.mjs",
      {
        PERSISTENCE_BACKEND: "postgres",
        UI_FUNCTIONAL_ALLOW_DB_RESET: "1",
        UI_FUNCTIONAL_PORT: process.env.UI_PARITY_POSTGRES_PORT?.trim() || "3161",
        UI_FUNCTIONAL_ARCHIVE_DIR: archiveDir,
      },
      postgresReportPath,
    );

    const [fileReport, postgresReport] = await Promise.all([
      readFile(fileReportPath, "utf8").then((value) => JSON.parse(value)),
      readFile(postgresReportPath, "utf8").then((value) => JSON.parse(value)),
    ]);

    assert.deepEqual(
      postgresReport.checkpoints,
      fileReport.checkpoints,
      "File and Postgres backends diverged during the browser workflow before reaching the final state.",
    );

    assert.deepEqual(
      postgresReport.finalState,
      fileReport.finalState,
      "File and Postgres backends diverged under the same browser workflow.",
    );

    log(`matched ${fileReport.checkpoints.length} browser checkpoints and final state across backends`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[ui-parity] failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
