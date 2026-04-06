import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[integration-smoke-postgres] DATABASE_URL is required.");
  process.exit(1);
}

const child = spawn(process.execPath, ["./scripts/integration-smoke.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    PERSISTENCE_BACKEND: "postgres",
    SMOKE_ALLOW_DB_RESET: "1",
    SMOKE_PORT: process.env.SMOKE_PORT?.trim() || "3131",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[integration-smoke-postgres] child exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
