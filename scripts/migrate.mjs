import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { getPool } from "../server/db.js";

const pool = getPool();
const client = await pool.connect();
const lockName = "kubovistas:schema-migrations:v1";

function executableSql(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT);\s*$/i.test(line))
    .join("\n");
}

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    checksum_sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    applied_by text NOT NULL
  )`);
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockName]);

  const names = (await readdir(new URL("../db/migrations/", import.meta.url)))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const appliedBy = String(
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "manual",
  ).slice(0, 120);

  for (const name of names) {
    const source = await readFile(
      new URL("../db/migrations/" + name, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(source).digest("hex");
    const existing = await client.query(
      "SELECT checksum_sha256 FROM schema_migrations WHERE version=$1",
      [name],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum_sha256 !== checksum)
        throw new Error(`Migration checksum mismatch: ${name}`);
      console.log(
        JSON.stringify({
          level: "info",
          event: "migration.skip",
          version: name,
        }),
      );
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query("SET LOCAL statement_timeout='60s'");
      await client.query(executableSql(source));
      await client.query(
        "INSERT INTO schema_migrations(version,checksum_sha256,applied_by) VALUES($1,$2,$3)",
        [name, checksum, appliedBy],
      );
      await client.query("COMMIT");
      console.log(
        JSON.stringify({
          level: "info",
          event: "migration.apply",
          version: name,
        }),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("KuboVistas database migrations are current.");
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]);
  } catch {}
  client.release();
  await pool.end();
}
