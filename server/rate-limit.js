import { createHmac } from "node:crypto";
import { databaseConfigured, transaction } from "./db.js";
import { logEvent } from "./observability.js";

const redisUrl = () =>
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = () =>
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const redisConfigured = () => Boolean(redisUrl() && redisToken());

async function redis(command) {
  const response = await fetch(redisUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw Error("Shared cache unavailable.");
  const data = await response.json();
  if (data.error) throw Error("Shared cache command failed.");
  return data.result;
}
function subjectHash(value) {
  const salt =
    process.env.RATE_LIMIT_SALT ||
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    "local-development-only";
  return createHmac("sha256", salt)
    .update(String(value || "anonymous"))
    .digest("hex");
}
export function requestSubject(req, userId = "") {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return userId
    ? `user:${userId}`
    : `ip:${forwarded || req.socket?.remoteAddress || "unknown"}`;
}
export async function consumeRateLimit({
  bucket,
  subject,
  limit,
  windowSeconds,
}) {
  const hash = subjectHash(subject);
  let count;
  if (redisConfigured()) {
    try {
      const key = `kubovistas:rate:${bucket}:${hash}`;
      const script =
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
      count = Number(
        await redis(["EVAL", script, "1", key, String(windowSeconds)]),
      );
    } catch (error) {
      logEvent("error", "rate-limit.redis-failed", {
        bucket,
        code: error?.name || "redis-error",
      });
    }
  }
  if (!Number.isFinite(count) && databaseConfigured()) {
    count = await transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO api_rate_limits(bucket,subject_hash,window_started_at,request_count,expires_at)
    VALUES($1,$2,now(),1,now()+($3::text||' seconds')::interval)
    ON CONFLICT(bucket,subject_hash) DO UPDATE SET
      window_started_at=CASE WHEN api_rate_limits.expires_at<=now() THEN now() ELSE api_rate_limits.window_started_at END,
      request_count=CASE WHEN api_rate_limits.expires_at<=now() THEN 1 ELSE api_rate_limits.request_count+1 END,
      expires_at=CASE WHEN api_rate_limits.expires_at<=now() THEN now()+($3::text||' seconds')::interval ELSE api_rate_limits.expires_at END
    RETURNING request_count`,
        [bucket, hash, windowSeconds],
      );
      return Number(result.rows[0].request_count);
    });
  }
  if (!Number.isFinite(count)) {
    logEvent("warn", "rate-limit.unconfigured", { bucket });
    return { allowed: false, retryAfter: windowSeconds, unavailable: true };
  }
  return {
    allowed: count <= limit,
    retryAfter: count <= limit ? 0 : windowSeconds,
    count,
  };
}
export async function sharedCacheGet(key) {
  if (!redisConfigured()) return null;
  try {
    const value = await redis(["GET", `kubovistas:cache:${key}`]);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
export async function sharedCacheSet(key, value, ttlSeconds) {
  if (!redisConfigured()) return false;
  try {
    await redis([
      "SETEX",
      `kubovistas:cache:${key}`,
      String(ttlSeconds),
      JSON.stringify(value),
    ]);
    return true;
  } catch {
    return false;
  }
}
