import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required when PERSISTENCE_BACKEND=postgres.");
  }
  return value;
}

function buildPool() {
  const connectionString = requireDatabaseUrl();
  const sslMode = process.env.PGSSLMODE?.trim().toLowerCase();

  return new Pool({
    connectionString,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPostgresPool() {
  if (!pool) {
    pool = buildPool();
  }

  return pool;
}

export async function withPostgresTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw new Error(`Cannot convert value to ISO string: ${String(value)}`);
}

export function rowText<T extends QueryResultRow>(row: T, key: keyof T): string | undefined {
  const value = row[key];
  return typeof value === "string" ? value : undefined;
}
