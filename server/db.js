import pg from 'pg';

const { Pool } = pg;
let pool;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!databaseConfigured()) throw new Error('DATABASE_URL is not configured.');
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      ssl: local ? false : { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000
    });
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
