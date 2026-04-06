import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";

function log(message) {
  console.log(`[functional-parity] ${message}`);
}

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for backend parity testing.");
  }

  return value;
}

async function runSuite(label, envOverrides, reportPath) {
  log(`running ${label} backend suite`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["./scripts/functional-tests.mjs"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        FUNCTIONAL_REPORT_PATH: reportPath,
        ...envOverrides,
      },
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} backend suite exited from signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} backend suite exited with code ${code}`));
        return;
      }

      resolve(undefined);
    });
  });
}

async function main() {
  requireDatabaseUrl();

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "longevity-functional-parity-"));
  const fileReportPath = path.join(tempDir, "file-report.json");
  const postgresReportPath = path.join(tempDir, "postgres-report.json");

  try {
    await runSuite(
      "file",
      {
        PERSISTENCE_BACKEND: "file",
        FUNCTIONAL_PORT: process.env.FUNCTIONAL_PARITY_FILE_PORT?.trim() || "3140",
      },
      fileReportPath,
    );

    await runSuite(
      "postgres",
      {
        PERSISTENCE_BACKEND: "postgres",
        FUNCTIONAL_ALLOW_DB_RESET: "1",
        FUNCTIONAL_PORT: process.env.FUNCTIONAL_PARITY_POSTGRES_PORT?.trim() || "3141",
      },
      postgresReportPath,
    );

    const [fileReport, postgresReport] = await Promise.all([
      readFile(fileReportPath, "utf8").then((value) => JSON.parse(value)),
      readFile(postgresReportPath, "utf8").then((value) => JSON.parse(value)),
    ]);

    assert.deepEqual(
      postgresReport.scenarioResults,
      fileReport.scenarioResults,
      "File and Postgres backends diverged under the same functional scenarios.",
    );

    log(`matched ${fileReport.scenarioResults.length} normalized scenario states across backends`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    `[functional-parity] failed: ${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exit(1);
});
