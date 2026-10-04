import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("payment order creation uses a durable attempt outside booking transactions", async () => {
  const route = await read("api/payments/create-order.js");
  const attempts = await read("server/payment-attempts.js");
  const migration = await read("db/migrations/011_reliability_security.sql");
  assert.match(route, /reservePaymentAttempt/);
  assert.match(
    route,
    /resolvePaymentAttempt\(payload\.attempt,\s*getRazorpay\(\)\)/,
  );
  assert.doesNotMatch(route, /transaction\([\s\S]*orders\.create/);
  assert.match(attempts, /findOrderByReceipt/);
  assert.match(attempts, /status='ambiguous'/);
  assert.match(attempts, /MAX_ATTEMPTS_PER_WINDOW = 3/);
  assert.match(attempts, /expires_at/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_attempts/);
  assert.match(migration, /provider_order_id text UNIQUE/);
});

test("migrations are checksum tracked, locked and production controlled", async () => {
  const migration = await read("scripts/migrate.mjs");
  const workflow = await read(".github/workflows/migrate-production.yml");
  assert.match(migration, /schema_migrations/);
  assert.match(migration, /createHash\("sha256"\)/);
  assert.match(migration, /pg_advisory_lock/);
  assert.match(migration, /Migration checksum mismatch/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /MIGRATE_PRODUCTION/);
});

test("CSP, safe logging and minimized webhook retention are present", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  const headers = vercel.headers.flatMap((item) => item.headers);
  const csp =
    headers.find((item) => item.key === "Content-Security-Policy-Report-Only")
      ?.value || "";
  for (const directive of [
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])
    assert.match(
      csp,
      new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  const http = await read("server/http.js");
  assert.doesNotMatch(http, /console\.error\(error\)/);
  assert.match(http, /requestId/);
  const webhook = await read("api/payments/webhook.js");
  assert.match(webhook, /payload_sha256/);
  assert.match(webhook, /payload\)\s*\n\s*VALUES[\s\S]*NULL/);
  const retention = await read("scripts/cleanup-retention.mjs");
  assert.match(retention, /payment_webhook_events WHERE expires_at<now\(\)/);
});

test("payment history and domain ownership expose only intended data", async () => {
  const payments = await read("api/payments.js");
  assert.doesNotMatch(payments, /SELECT p\.\*/);
  const selectList = payments.match(/SELECT([\s\S]*?)FROM payments/)?.[1] || "";
  assert.doesNotMatch(selectList, /failure_reason|payment_attempt_id|user_id/);
  const rules = await read("firestore.rules");
  assert.match(rules, /allow read, write: if false/);
  await assert.rejects(read("client/firestore.js"));
  await assert.rejects(read("server/firestore.js"));
  const profile = await read("server/account/profile.js");
  const settings = await read("server/account/settings.js");
  assert.match(profile, /traveler_profiles/);
  assert.match(settings, /traveler_settings/);
});

test("shared protection, strict analytics consent and recovery drills are codified", async () => {
  const limiter = await read("server/rate-limit.js");
  assert.match(limiter, /KV_REST_API_URL/);
  assert.match(limiter, /api_rate_limits/);
  const consent = await read("client/consent.js");
  const loader =
    consent.match(/function loadAnalytics\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(loader, /window\.dataLayer \|\|= \[\]/);
  assert.doesNotMatch(
    consent.slice(0, consent.indexOf("function loadAnalytics()")),
    /dataLayer|window\.gtag/,
  );
  const auth = await read("server/auth.js");
  assert.doesNotMatch(auth, /ADMIN_EMAILS/);
  assert.match(auth, /mfaVerified/);
  const restore = await read("scripts/verify-restore.mjs");
  assert.match(restore, /RESTORE_DATABASE_URL/);
  assert.match(
    await read(".github/workflows/verify-restore.yml"),
    /recovery-drill/,
  );
});
