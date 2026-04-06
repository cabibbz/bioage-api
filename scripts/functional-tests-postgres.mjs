import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[functional-tests-postgres] DATABASE_URL is required.");
  process.exit(1);
}

const child = spawn(process.execPath, ["./scripts/functional-tests.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    PERSISTENCE_BACKEND: "postgres",
    FUNCTIONAL_ALLOW_DB_RESET: "1",
    FUNCTIONAL_PORT: process.env.FUNCTIONAL_PORT?.trim() || process.env.SMOKE_PORT?.trim() || "3141",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[functional-tests-postgres] child exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
