import { spawn } from "node:child_process";

function log(message) {
  console.log(`[meta-verify] ${message}`);
}

async function run(command, args, options = {}) {
  const label = [command, ...args].join(" ");
  log(`running ${label}`);
  const useShell = process.platform === "win32";

  await new Promise((resolve, reject) => {
    const child = spawn(useShell ? label : command, useShell ? [] : args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: useShell,
      env: {
        ...process.env,
        ...options.env,
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

async function main() {
  await run("npm.cmd", ["run", "docs:verify"]);
  await run("npm.cmd", ["run", "typecheck"]);
  await run("node", ["--check", "scripts/bootstrap-postgres.mjs"]);
  await run("npm.cmd", ["run", "build"]);
  await run("npm.cmd", ["run", "seed:postgres:export"]);
  await run("npm.cmd", ["run", "test:functional:file"]);
  await run("npm.cmd", ["run", "test:ui:file"]);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const requirePostgres = process.env.META_VERIFY_REQUIRE_POSTGRES === "1";

  if (databaseUrl) {
    await run("npm.cmd", ["run", "bootstrap:postgres"]);
    await run("npm.cmd", ["run", "test:functional:postgres"]);
    await run("npm.cmd", ["run", "test:functional:parity"]);
  } else if (requirePostgres) {
    throw new Error("DATABASE_URL is required because META_VERIFY_REQUIRE_POSTGRES=1.");
  } else {
    log("skipping Postgres functional suite because DATABASE_URL is not set.");
  }

  log("session verification passed.");
}

main().catch((error) => {
  console.error(`[meta-verify] failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
