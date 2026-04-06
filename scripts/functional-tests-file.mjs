import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["./scripts/functional-tests.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    PERSISTENCE_BACKEND: "file",
    FUNCTIONAL_PORT: process.env.FUNCTIONAL_PORT?.trim() || process.env.SMOKE_PORT?.trim() || "3140",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[functional-tests-file] child exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
