import pg from "pg";
import { logEvent } from "./observability.js";

const { Pool } = pg;
let pool;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!databaseConfigured()) throw new Error("DATABASE_URL is not configured.");
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    const configuredMax = Number(process.env.DATABASE_POOL_MAX || 3);
    pool = new Pool({
      connectionString,
      ssl: local ? false : { rejectUnauthorized: true },
      max: Number.isInteger(configuredMax)
        ? Math.min(10, Math.max(1, configuredMax))
        : 3,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
      application_name: "kubovistas-api",
    });
    pool.on("error", (error) =>
      logEvent("error", "database.pool.error", {
        code: error?.code || "pool-error",
      }),
    );
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function transaction(callback) {
  const waitingAt = Date.now();
  const client = await getPool().connect();
  const wait = Date.now() - waitingAt;
  if (wait > 250) logEvent("warn", "database.pool.wait", { durationMs: wait });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
