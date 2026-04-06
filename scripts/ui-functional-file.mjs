import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["./scripts/ui-functional.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    PERSISTENCE_BACKEND: "file",
    UI_FUNCTIONAL_PORT: process.env.UI_FUNCTIONAL_PORT?.trim() || "3160",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[ui-functional-file] child exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
