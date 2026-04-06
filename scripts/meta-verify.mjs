import { spawn } from "node:child_process";

function log(message) {
  console.log(`[meta-verify] ${message}`);
}

const safeDirectory = process.cwd().replaceAll("\\", "/");

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

async function capture(command, args, options = {}) {
  const label = [command, ...args].join(" ");
  const useShell = process.platform === "win32";

  return new Promise((resolve, reject) => {
    const child = spawn(useShell ? label : command, useShell ? [] : args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: useShell,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} exited from signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} exited with code ${code}\nSTDERR:\n${stderr}`));
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

async function getGitStatusSnapshot() {
  const { stdout } = await capture("git", [
    "-c",
    `safe.directory=${safeDirectory}`,
    "status",
    "--short",
    "--untracked-files=all",
  ]);

  return stdout.replaceAll("\r\n", "\n").trimEnd();
}

async function main() {
  const statusBefore = await getGitStatusSnapshot();

  await run("npm.cmd", ["run", "docs:verify"]);
  await run("npm.cmd", ["run", "typecheck"]);
  await run("node", ["--check", "scripts/bootstrap-postgres.mjs"]);
  await run("npm.cmd", ["run", "build"]);
  await run("npm.cmd", ["run", "seed:postgres:check"]);
  await run("npm.cmd", ["run", "test:functional:file"], {
    env: {
      PERSISTENCE_BACKEND: "file",
    },
  });
  await run("npm.cmd", ["run", "test:ui:file"], {
    env: {
      PERSISTENCE_BACKEND: "file",
    },
  });

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const requirePostgres = process.env.META_VERIFY_REQUIRE_POSTGRES === "1";

  if (databaseUrl) {
    await run("npm.cmd", ["run", "bootstrap:postgres"]);
    await run("npm.cmd", ["run", "test:functional:postgres"], {
      env: {
        PERSISTENCE_BACKEND: "postgres",
        FUNCTIONAL_ALLOW_DB_RESET: "1",
      },
    });
    await run("npm.cmd", ["run", "test:ui:postgres"]);
    await run("npm.cmd", ["run", "test:functional:parity"]);
    await run("npm.cmd", ["run", "test:ui:parity"]);
  } else if (requirePostgres) {
    throw new Error("DATABASE_URL is required because META_VERIFY_REQUIRE_POSTGRES=1.");
  } else {
    log("skipping Postgres functional suite because DATABASE_URL is not set.");
  }

  const statusAfter = await getGitStatusSnapshot();
  if (statusAfter !== statusBefore) {
    throw new Error(
      [
        "verify:meta changed the git worktree relative to its starting state.",
        "Status before:",
        statusBefore || "(clean)",
        "Status after:",
        statusAfter || "(clean)",
      ].join("\n"),
    );
  }

  log("session verification passed.");
}

main().catch((error) => {
  console.error(`[meta-verify] failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
