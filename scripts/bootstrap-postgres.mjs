import path from "node:path";
import { applySchemaAndSeed } from "./lib/postgres-admin.mjs";

async function main() {
  const { schemaPath, seedPath } = await applySchemaAndSeed({ reset: false });
  console.log(`bootstrap-postgres: applied schema from ${path.relative(process.cwd(), schemaPath)}`);
  console.log(`bootstrap-postgres: applied seed from ${path.relative(process.cwd(), seedPath)}`);
}

main().catch((error) => {
  console.error(`bootstrap-postgres: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
