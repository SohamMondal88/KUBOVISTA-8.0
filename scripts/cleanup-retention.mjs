import { getPool } from "../server/db.js";
const pool = getPool();
try {
  const webhooks = await pool.query(
    "DELETE FROM payment_webhook_events WHERE expires_at<now() RETURNING event_id",
  );
  const limits = await pool.query(
    "DELETE FROM api_rate_limits WHERE expires_at<now() RETURNING bucket",
  );
  console.log(
    JSON.stringify({
      level: "info",
      event: "retention.cleanup",
      webhookEvents: webhooks.rowCount,
      rateLimitBuckets: limits.rowCount,
    }),
  );
} finally {
  await pool.end();
}
