import path from "node:path";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const resetTablesSql = `
drop table if exists measurement_promotions cascade;
drop table if exists review_decisions cascade;
drop table if exists parse_tasks cascade;
drop table if exists source_documents cascade;
drop table if exists report_ingestions cascade;
drop table if exists patient_timeline_events cascade;
drop table if exists patient_measurements cascade;
drop table if exists patients cascade;
`;

export function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for Postgres operations.");
  }

  return value;
}

export function resolveSqlPath(envName, fallbackRelativePath) {
  const configured = process.env[envName]?.trim();
  return path.resolve(process.cwd(), configured || fallbackRelativePath);
}

function buildPool() {
  const sslMode = process.env.PGSSLMODE?.trim().toLowerCase();

  return new Pool({
    connectionString: requireDatabaseUrl(),
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

export async function applySchemaAndSeed(options = {}) {
  const { reset = false } = options;
  const schemaPath = resolveSqlPath("POSTGRES_SCHEMA_PATH", path.join("db", "postgres-schema.sql"));
  const seedPath = resolveSqlPath("POSTGRES_SEED_PATH", path.join("db", "seed-from-store.sql"));

  const [schemaSql, seedSql] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(seedPath, "utf8"),
  ]);

  const pool = buildPool();

  try {
    const client = await pool.connect();

    try {
      if (reset) {
        await client.query(resetTablesSql);
      }

      await client.query(schemaSql);
      await client.query(seedSql);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  return { schemaPath, seedPath };
}
