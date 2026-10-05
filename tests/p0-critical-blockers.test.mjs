import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { allowedOrigins } from "../server/auth.js";
import {
  checkReadiness,
  EXPECTED_MIGRATION,
  readinessAuthorized,
} from "../server/readiness.js";
import { matchRemoteRefund } from "../server/refunds.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("origin allowlist accepts only exact configured HTTPS origins", () => {
  const origins = allowedOrigins({
    APP_URL: "https://kubovista.com/path",
    APP_ORIGINS:
      "https://www.kubovista.com,https://preview.example,https://*.invalid.example,http://insecure.example",
  });
  assert.deepEqual(
    [...origins],
    [
      "https://kubovista.com",
      "https://www.kubovista.com",
      "https://preview.example",
    ],
  );
  assert.equal(origins.has("https://attacker.kubovista.com"), false);
  assert.equal(origins.has("http://insecure.example"), false);
});

test("protected readiness requires a strong exact bearer secret", () => {
  const request = { headers: { authorization: `Bearer ${"x".repeat(32)}` } };
  assert.equal(
    readinessAuthorized(request, { READINESS_SECRET: "x".repeat(32) }),
    true,
  );
  assert.equal(
    readinessAuthorized(request, { READINESS_SECRET: "x".repeat(31) }),
    false,
  );
  assert.equal(
    readinessAuthorized(
      { headers: { authorization: `Bearer ${"x".repeat(33)}` } },
      { READINESS_SECRET: "x".repeat(32) },
    ),
    false,
  );
});

test("readiness checks database, expected migration, schema and Firebase reachability", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://configured-only";
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE schema_migrations(version text PRIMARY KEY);
      CREATE TABLE "user"(firebase_uid text,"emailVerified" boolean,role text,disabled_at timestamptz);
      CREATE TABLE traveler_profiles(user_id text);
      CREATE TABLE traveler_settings(user_id text);
      CREATE TABLE bookings(current_quote_version integer);
      CREATE TABLE booking_quotes(id text);
      CREATE TABLE payments(payment_attempt_id text);
      CREATE TABLE payment_attempts(expires_at timestamptz);
      CREATE TABLE payment_refunds(submission_state text);
      CREATE TABLE user_notifications(user_id text);
      CREATE TABLE audit_logs(actor_id text);
      INSERT INTO schema_migrations(version) VALUES('${EXPECTED_MIGRATION}');
    `);
    const result = await checkReadiness({
      databaseQuery: async (sql, params) => {
        if (params) assert.deepEqual(params, [EXPECTED_MIGRATION]);
        return db.query(sql, params);
      },
      auth: () => ({ listUsers: async (limit) => assert.equal(limit, 1) }),
    });
    assert.equal(result.ready, true);
    assert.equal(result.checks.firebaseAdmin.ready, true);
    assert.equal(result.checks.payments.ready, false);
  } finally {
    await db.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("readiness distinguishes a missing migration ledger from database downtime", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://configured-only";
  const db = new PGlite();
  try {
    const result = await checkReadiness({
      databaseQuery: (sql, params) => db.query(sql, params),
      auth: () => ({ listUsers: async () => {} }),
    });
    assert.equal(result.checks.database.ready, true);
    assert.equal(result.checks.migrations.ready, false);
    assert.equal(result.checks.migrations.code, "migration-ledger-missing");
    assert.equal(result.checks.schema.ready, false);
  } finally {
    await db.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("refund reconciliation matches the stable provider receipt or note", () => {
  const expected = {
    id: "rfnd_1",
    payment_id: "pay_1",
    amount: 100,
    status: "pending",
    receipt: "attempt-1",
  };
  assert.equal(
    matchRemoteRefund([expected], {
      paymentId: "pay_1",
      amountPaise: 100,
      attemptId: "attempt-1",
    }),
    expected,
  );
  assert.equal(
    matchRemoteRefund([expected], {
      paymentId: "pay_1",
      amountPaise: 100,
      attemptId: "attempt-2",
    }),
    null,
  );
});

test("refund submission never relies on a custom idempotency header", async () => {
  const refunds = await read("server/refunds.js");
  const route = await read("api/admin/refund.js");
  const migration = await read("db/migrations/012_p0_critical_blockers.sql");
  assert.doesNotMatch(refunds, /X-Refund-Idempotency/i);
  assert.match(refunds, /receipt: attemptId/);
  assert.match(refunds, /kubovistas_refund_attempt/);
  assert.match(route, /Always pull provider state before reserving/);
  assert.ok(route.indexOf("reconcileBooking") < route.indexOf("issueRefund("));
  assert.match(route, /submission_state.*ambiguous/s);
  assert.match(migration, /payment_refunds_reconcile_idx/);
});

test("secret rotation and production activation are explicitly gated", async () => {
  const runbook = await read("docs/P0_PRODUCTION_ACTIVATION.md");
  const workflow = await read(".github/workflows/synthetic-readiness.yml");
  assert.match(runbook, /Rotate exposed credentials before any deployment/);
  assert.match(runbook, /git filter-repo/);
  assert.match(runbook, /PAYMENTS_ENABLED=false/);
  assert.match(runbook, /Ambiguous refund/);
  assert.match(workflow, /READINESS_SECRET/);
});
