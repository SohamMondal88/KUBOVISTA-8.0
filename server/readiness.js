import { timingSafeEqual } from "node:crypto";
import { getAuth } from "./auth.js";
import { databaseConfigured, query } from "./db.js";
import { json, methodNotAllowed } from "./http.js";
import { logEvent, requestId, safeErrorCode } from "./observability.js";
import { paymentReadiness } from "./razorpay.js";

export const EXPECTED_MIGRATION = "012_p0_critical_blockers.sql";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readinessAuthorized(req, env = process.env) {
  const secret = String(env.READINESS_SECRET || "");
  const header = String(req.headers.authorization || "");
  return secret.length >= 32 && safeEqual(header, `Bearer ${secret}`);
}

async function withTimeout(promise, milliseconds, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error(code), { code })),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness({
  databaseQuery = query,
  auth = getAuth,
} = {}) {
  const checks = {
    database: { ready: false },
    migrations: { ready: false },
    schema: { ready: false },
    firebaseAdmin: { ready: false },
    payments: { ready: paymentReadiness().enabled },
  };
  if (!databaseConfigured()) return { ready: false, checks };

  try {
    const connected = await withTimeout(
      databaseQuery("SELECT 1 AS connected"),
      5_000,
      "database-readiness-timeout",
    );
    checks.database.ready = connected.rows[0]?.connected === 1;
  } catch (error) {
    checks.database.code = safeErrorCode(error);
  }

  if (checks.database.ready) {
    try {
      const ledger = await databaseQuery(
        `SELECT EXISTS(
          SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='schema_migrations'
        ) AS exists`,
      );
      if (ledger.rows[0]?.exists === true) {
        const migration = await databaseQuery(
          "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1) AS migrated",
          [EXPECTED_MIGRATION],
        );
        checks.migrations.ready = migration.rows[0]?.migrated === true;
      } else {
        checks.migrations.code = "migration-ledger-missing";
      }
    } catch (error) {
      checks.migrations.code = safeErrorCode(error);
    }

    try {
      const schema = await databaseQuery(`SELECT
        NOT EXISTS (
          SELECT 1 FROM (VALUES
            ('user','firebase_uid'), ('user','emailVerified'),
            ('user','role'), ('user','disabled_at'),
            ('traveler_profiles','user_id'),
            ('traveler_settings','user_id'),
            ('bookings','current_quote_version'),
            ('payments','payment_attempt_id'),
            ('payment_attempts','expires_at'),
            ('payment_refunds','submission_state'),
            ('user_notifications','user_id'), ('audit_logs','actor_id')
          ) AS required(table_name,column_name)
          WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns actual
            WHERE actual.table_schema='public'
              AND actual.table_name=required.table_name
              AND actual.column_name=required.column_name
          )
        ) AS schema_ready`);
      checks.schema.ready = schema.rows[0]?.schema_ready === true;
    } catch (error) {
      checks.schema.code = safeErrorCode(error);
    }
  }

  try {
    await withTimeout(auth().listUsers(1), 5_000, "firebase-readiness-timeout");
    checks.firebaseAdmin.ready = true;
  } catch (error) {
    checks.firebaseAdmin.code = safeErrorCode(error);
  }

  return {
    ready: Object.entries(checks)
      .filter(([name]) => name !== "payments")
      .every(([, check]) => check.ready),
    checks,
  };
}

export default async function readiness(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const id = requestId(req);
  if (!readinessAuthorized(req))
    return json(res, 401, {
      error: "Readiness authorization required.",
      requestId: id,
    });
  const result = await checkReadiness();
  logEvent(result.ready ? "info" : "error", "service.readiness", {
    requestId: id,
    route: "readiness",
    status: result.ready ? 200 : 503,
  });
  return json(res, result.ready ? 200 : 503, {
    status: result.ready ? "ready" : "not-ready",
    ...result,
    requestId: id,
  });
}
