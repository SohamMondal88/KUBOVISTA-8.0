# P1 reliability and security release

This release addresses the P1 application defects. It supplies code and repeatable controls; it does not claim that third-party dashboards, production backups, legal review, or a live payment have been verified. Keep checkout disabled until the production checklist is evidenced.

## Implemented controls

| Area | Implementation |
| --- | --- |
| Payment order lifecycle | `payment_attempts` reserves work in a short PostgreSQL transaction, calls Razorpay after the connection is released, and persists the provider order in a second transaction. Receipts are unique and ambiguous calls are recovered by receipt. |
| Retry and expiry | Attempts retain their history, expire after 20 minutes, validate remote order/payment state before reuse, replace definitively failed or expired attempts, cap attempts, and apply a shared order-creation rate limit. |
| Migrations | `schema_migrations` records the SHA-256 checksum and actor for each file. A session advisory lock serializes runners and each unapplied migration gets its own transaction. Production migration is a protected manual workflow. Never edit an applied migration. |
| Browser policy | CSP is report-only during discovery, with `object-src 'none'`, `base-uri 'self'`, restricted `form-action`, `frame-ancestors`, and explicit Google, Firebase, Razorpay, API, frame, and media sources. Sanitized violation categories are logged. |
| Logs | Application logs contain an event code, request ID, route, status, duration or provider where applicable. Raw errors, headers, bodies, email addresses, tokens, SQL details, and provider payloads are not logged. |
| App Check | Mutations still fail closed. The browser force-refreshes once, gives an actionable retry/reload message, and submits only a sanitized failure signal for monitoring. |
| Webhook retention | Razorpay webhook rows store normalized identifiers/status plus a SHA-256 digest, not the full payload. A daily protected job removes expired rows and rate-limit buckets. |
| Payment history | The traveler endpoint selects an explicit response schema and excludes user IDs, attempt internals, provider diagnostics, and failure details. |
| Database pressure | Payment provider calls occur outside transactions. The pool has bounded size and statement, lock, connection, and idle-transaction timeouts; slow pool acquisition emits a structured warning. Use a serverless-compatible pooler in production. |
| Data ownership | PostgreSQL is authoritative for users, profiles, settings, roles, bookings, commerce, notifications, support, suppliers, and editorial data. Firebase provides identity, App Check, and push only. Browser Firestore access is denied. |
| Administrator access | Runtime `ADMIN_EMAILS` elevation is removed. Admin routes require a verified Firebase identity, PostgreSQL `admin` role, and MFA claim. The one-time bootstrap script is explicitly gated and writes an audit record. |
| Shared abuse protection | Redis/Upstash REST is preferred. PostgreSQL provides a shared fail-closed fallback. Payment creation, enquiries, AI, weather, journal, growth endpoints, client signals, and CSP reports have route-specific limits. |
| Analytics consent | Google Analytics code and globals are created only after affirmative stored consent. Revocation disables collection. |
| Recovery proof | Retention, protected migration, isolated-restore verification, and readiness-probe workflows produce retained artifacts. Restore verification refuses to target `DATABASE_URL`. |

## Required production configuration

Set secrets in the Vercel Production environment, not in source: PostgreSQL pooler `DATABASE_URL`, Firebase Admin credentials, Razorpay live key/secret and webhook secret, `RATE_LIMIT_SALT`, and either `KV_REST_API_URL`/`KV_REST_API_TOKEN` or their Upstash equivalents. Configure `PRODUCTION_URL` as a GitHub production-environment variable.

Create a Vercel log drain or approved monitoring integration for structured runtime logs. Alert on `payments.*`, `auth.*`, `app-check.*`, `security.csp-violation`, `database.pool-wait`, webhook 4xx/5xx rate, and function error rate. Dashboard provider success/latency separately from local database failures. Access to logs must be least-privilege and retention must match the privacy policy.

The scheduled readiness probe verifies public reachability, configuration response shape, and security headers without creating bookings or orders. A genuine checkout synthetic would create provider and financial records; run that only in Razorpay test mode against an isolated preview and test database. Do not automate paid live transactions.

## CSP rollout

1. Deploy report-only. Exercise authentication, Google sign-in, Razorpay checkout/cancel/failure, Firebase refresh and push, maps, analytics consent, images, dialogs, and all account routes.
2. Review sanitized violation categories for at least one representative traffic cycle. Update only narrowly required origins.
3. Remove inline scripts/styles or migrate them to generated hashes/nonces. Vercel static headers cannot generate per-request nonces for static HTML.
4. Replace `Content-Security-Policy-Report-Only` with enforced `Content-Security-Policy`, remove `'unsafe-inline'`, redeploy to preview, and repeat browser checks before production promotion.

## Backup and restore evidence

Enable encrypted managed PostgreSQL backups and point-in-time recovery in the database provider. Keep a separate retention tier and restrict restore privileges. Target RPO: 15 minutes; target RTO: 4 hours, subject to provider capability and an owner-approved business-impact review.

At least quarterly, restore the latest backup to an isolated database, set only `RESTORE_DATABASE_URL` in the protected `recovery-drill` environment, run **Verify isolated database restore**, compare table counts and the latest migration with production, test representative account/booking/payment reads, then destroy the isolated restore. Retain the workflow artifact and incident ticket. Documentation or a green configuration flag is not backup proof; the completed provider backup and restore-drill records are the proof.

## Release sequence

1. Keep `PAYMENTS_ENABLED=false`; take and verify a fresh backup.
2. Run the protected production migration workflow and confirm migration checksums.
3. Configure shared Redis, log drain/alerts, database pooler, retention workflow, readiness URL, and the tested deny-all Firestore rules.
4. Deploy to preview. Run `npm ci`, `npm run check`, coverage, lint, formatting, build, Firestore emulator tests, and Playwright/axe checks.
5. Complete Razorpay test-mode deposit, cancellation, failed attempt, retry, webhook replay, capture, balance, reconciliation, and refund scenarios. Confirm no external provider request occurs while a database transaction is open.
6. Complete the isolated restore drill, review CSP reports, enroll administrator MFA, and record approvals. Enable production checkout only after two-person review.

During an incident, disable order creation but keep signed webhooks active, preserve request/event IDs, reconcile against Razorpay, and never overwrite newer financial data with an older backup.
