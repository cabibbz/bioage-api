import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[ui-functional-postgres] DATABASE_URL is required.");
  process.exit(1);
}

const child = spawn(process.execPath, ["./scripts/ui-functional.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    PERSISTENCE_BACKEND: "postgres",
    UI_FUNCTIONAL_ALLOW_DB_RESET: "1",
    UI_FUNCTIONAL_PORT: process.env.UI_FUNCTIONAL_PORT?.trim() || "3161",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[ui-functional-postgres] child exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
