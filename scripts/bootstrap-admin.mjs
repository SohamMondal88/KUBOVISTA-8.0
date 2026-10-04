import { getPool } from "../server/db.js";

if (process.env.ADMIN_BOOTSTRAP_ENABLED !== "true")
  throw Error(
    "Set ADMIN_BOOTSTRAP_ENABLED=true only for this one offline operation.",
  );
const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || "")
  .trim()
  .toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email))
  throw Error("ADMIN_BOOTSTRAP_EMAIL must be a verified account email.");
const pool = getPool();
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  const user = (
    await client.query(
      'SELECT id,"emailVerified",role FROM "user" WHERE lower(email)=$1 FOR UPDATE',
      [email],
    )
  ).rows[0];
  if (!user || user.emailVerified !== true)
    throw Error(
      "The bootstrap account must already exist with a verified email.",
    );
  await client.query(
    'UPDATE "user" SET role=\'admin\',"updatedAt"=now() WHERE id=$1',
    [user.id],
  );
  await client.query(
    "INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES(NULL,'role.bootstrap_admin','user',$1,$2)",
    [
      user.id,
      JSON.stringify({ previousRole: user.role, method: "offline-script" }),
    ],
  );
  await client.query("COMMIT");
  console.log(
    "Administrator role bootstrapped. Disable and remove the bootstrap environment values now.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
