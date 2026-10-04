import pg from "pg";
const url = process.env.RESTORE_DATABASE_URL;
if (!url)
  throw Error(
    "RESTORE_DATABASE_URL must point to an isolated restored database, never production.",
  );
if (url === process.env.DATABASE_URL)
  throw Error("Restore verification refuses to run against DATABASE_URL.");
const pool = new pg.Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url)
    ? false
    : { rejectUnauthorized: true },
  max: 1,
  statement_timeout: 15000,
});
try {
  const tables = [
    "schema_migrations",
    "user",
    "bookings",
    "payments",
    "payment_attempts",
    "payment_webhook_events",
    "audit_logs",
  ];
  const result = { checkedAt: new Date().toISOString(), tables: {} };
  for (const name of tables) {
    const exists = await pool.query("SELECT to_regclass($1) AS value", [
      name === "user" ? 'public."user"' : `public.${name}`,
    ]);
    if (!exists.rows[0].value)
      throw Error(`Restored database is missing ${name}.`);
    const count = await pool.query(
      `SELECT count(*)::int AS count FROM ${name === "user" ? '"user"' : name}`,
    );
    result.tables[name] = Number(count.rows[0].count);
  }
  const migration = await pool.query(
    "SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version DESC LIMIT 1",
  );
  result.latestMigration = migration.rows[0]?.version || null;
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
