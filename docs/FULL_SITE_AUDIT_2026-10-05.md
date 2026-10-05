# KuboVistas code and production audit — 5 October 2026

## Executive conclusion

The static build and the tested server modules are healthy, but production is not yet demonstrably ready for account or payment traffic. The public configuration endpoint reports that authentication variables exist; it does not prove that Firebase Admin can verify a real token or that PostgreSQL has the account schema. Vercel runtime-error access returned `403`, and the protected readiness secret is not configured, so the exact live failure cannot be observed from the available production controls.

The most likely cause of **Account service is unavailable** is an unavailable PostgreSQL connection or an unapplied/out-of-date production schema. The production migration and protected readiness jobs must be run before the incident can be closed. Firebase's **Email or password is incorrect** response is a separate credential failure. Accounts migrated from the former authentication system do not have a Firebase password until the traveler completes **Forgot password**.

This branch fixes the misleading/generic client result, stable server error classification, the readiness probe's incorrect column check, and the malformed password-reset continuation URL. It deliberately does not expose SQL, provider payloads, tokens, or credentials to the browser.

## Findings and solutions

### P0 — production blockers

| # | Finding | Evidence / impact | Required solution | State |
|---|---|---|---|---|
| 1 | Live account failure is not observable | Production runtime-error/log requests return `403`; the browser receives only a generic 503. | Restore Vercel Observability permission or add a log drain. Correlate the new browser reference with the sanitized `auth.session-unavailable` event. | External action required |
| 2 | Production account schema is not verified | Authentication requires `user.firebase_uid`, `user.disabled_at`, role fields and migration-backed account tables. There is no successful protected readiness result. | Take a verified backup, run the **Migrate production database** workflow with `MIGRATE_PRODUCTION`, then run the readiness workflow. | External action required |
| 3 | Protected readiness cannot run | `READINESS_SECRET` is absent from the production configuration inspected during this audit. | Generate one 32+ character secret, set the same value in Vercel Production and the GitHub `production` environment, redeploy, then run the probe. | External action required |
| 4 | Payment is disabled in production | `/api/config` reports `payments: false`; the webhook secret is not configured. Checkout correctly fails closed. | Rotate any historically exposed credentials; configure live key ID, secret and webhook secret plus approved business/legal flags; migrate; run a controlled test-mode journey before live mode. | External action required |
| 5 | Previously committed secrets remain an incident until rotated and purged | Removing values from the current `.env.example` does not invalidate Git history. | Rotate every exposed Razorpay/Firebase/database/webhook secret, purge sensitive history with `git-filter-repo` or BFG, invalidate old deployments, and enable GitHub secret scanning. | Security owner required |
| 6 | No verified provider-backed auth/payment journey | Unit tests mock provider boundaries. The current browser suite does not sign in, create an order, process a webhook, issue an invoice, or refund. | Test email reset/login and Google login; then booking → quote → order → Razorpay modal → capture → webhook → confirmation → invoice → partial/full refund, including cancellation, replay and delayed webhook cases. | Release blocker |

### P1 — major defects and risks

| # | Finding | Evidence / impact | Solution | State |
|---|---|---|---|---|
| 7 | Readiness checked the wrong email column | It checked `user.email_verified`; the schema uses quoted `user."emailVerified"`. A healthy database could be reported as unhealthy. | Check the real column and report database, migration-ledger and schema state separately. | Fixed in this branch |
| 8 | Server account failures lost their cause at the browser | Schema, identity-provider and account-migration failures collapsed into the same generic message. Support could not correlate the incident. | Return only stable safe codes and a request ID; retain detailed provider/SQL data server-side. | Fixed in this branch |
| 9 | Password-reset continuation URL was malformed | `account.js` generated an origin followed by `//reset-password`. | Use the canonical `/account/reset-password` route. | Fixed in this branch |
| 10 | Public configuration is not health | `configured.auth` checks environment presence, not database/Firebase reachability. The login form can appear during an outage. | Keep `configured` naming, use the protected readiness monitor for alerts, and optionally publish only a cached generic availability boolean—never internal check details. | Open |
| 11 | CSP is report-only and permits inline code/style | `vercel.json` sends `Content-Security-Policy-Report-Only` with `'unsafe-inline'`. Injection protection is not enforced. | Exercise all third-party flows in preview, replace inline handlers/import-map dependencies with nonce/hash-compatible code, remove unsafe directives, then enforce CSP. | Open |
| 12 | Broad database rows cross API boundaries | Bookings, notifications, support, supplier and editorial/admin handlers contain `SELECT *` and sometimes return those rows. New internal columns could be exposed accidentally. | Define explicit response projections per role and route; keep lock-only `SELECT * ... FOR UPDATE` queries internal. Add schema-contract tests. | Open |
| 13 | Silent catches conceal degraded services | Search/editorial/reviews/contact/social and Travel Date paths contain empty catches. Some fallbacks are intentional but no signal is emitted. | Log a sanitized service code/request ID and show an explicit degraded-state message where the missing data changes the page. | Open |
| 14 | Account and commercial server modules have weak direct coverage | Coverage is especially low for `server/operations.js`, `server/growth.js`, `server/rate-limit.js`, refunds and account handlers. | Add route tests for authorization, safe output schemas, concurrency, limits, provider timeouts and transaction rollback. Raise per-module thresholds for critical code. | Open |
| 15 | Browser coverage is too narrow | Six cases cover only home/destinations, basic navigation, consent, overflow and axe; the map is excluded from axe. | Add authenticated fixtures and tests for reset/login/Google recovery, every account page, checkout, payment failure/cancel, dialogs, map keyboard controls and 360/390/600/768/1024/1440/1920 widths. | Open |
| 16 | Production backup/restore remains unproven | Workflows and runbooks exist, but no successful restore artifact was available in this audit. | Enable encrypted PITR, run an isolated restore rehearsal, record RPO/RTO and evidence, and test rollback ownership. | Operations action required |

### P2 — maintainability, performance and UX

| # | Finding | Evidence / impact | Solution | State |
|---|---|---|---|---|
| 17 | Main bundle still includes content-heavy modules globally | `app.js` statically imports destination data, legal content, maps/explore helpers and package metadata. `styles.css` is about 136 KB. | Split route renderers/content catalogs, tree-shake page data, and measure parsed/transfer size on a mid-range mobile profile. | Open |
| 18 | Core JS/CSS filenames are not content-hashed | Images and Firebase chunks are fingerprinted, but `app.js`, `styles.css` and several route modules retain stable names and short caching. | Fingerprint built JS/CSS, rewrite HTML/import references, and serve hashed files with immutable caching. | Open |
| 19 | Destination photography remains heavily reused | Two large photographs support many journey/detail contexts; editorial SVGs reduce but do not remove repetition. | Add licensed destination-specific responsive images with truthful captions and dimensions. Never imply a generic image is a supplier/property. | Content action required |
| 20 | Several large UI/server files are difficult to review | `styles.css`, `account.js`, `app.js`, `operations.js` and `growth.js` combine unrelated domains; some server files are densely formatted. | Split by bounded route/domain, preserve shared validators and response mappers, and apply formatting to all source modules. | Open |
| 21 | Client route errors use a locally generated support reference | Render failures create a UUID that is not present in server logs. | Prefer an API request ID when the failure came from a request; label local-only references separately. | Open |
| 22 | Browser dependency installation is not reproducible in this workspace | `npm run test:e2e` could not launch because the Playwright Chromium binary was unavailable; an attempted download did not install it. CI does include `playwright install --with-deps`. | Preserve the CI install step, cache browser binaries by Playwright version, and fail with a dedicated setup message. | Environment limitation |
| 23 | Dependency tooling emits an obsolete proxy warning | npm reports that the `http-proxy` environment configuration will stop working in a future npm release. | Remove/rename the obsolete runner-level npm setting before the next npm major upgrade. | Runner configuration |
| 24 | Public failure states sometimes trade transparency for silent fallback | Empty article/review/affiliate lists can look like valid “no content” states during database failure. | Distinguish `empty`, `not configured`, and `temporarily unavailable`, with retry and request reference where applicable. | Open |
| 25 | Development dependency audit reports vulnerable Firebase CLI transitive packages | The production-only audit is clean, but the full audit reports two moderate and seven high findings through `firebase-tools` (`braces`, proxy/FTP parsing and OpenTelemetry). This tooling runs in CI/emulators, not the deployed runtime. | Track the upstream Firebase CLI resolution, pin patched transitive versions only after emulator compatibility testing, and keep untrusted PAC/FTP/baggage input out of CI. Do not treat the clean production audit as a clean full toolchain audit. | Open |

## Authentication recovery sequence

1. Rotate and validate the Firebase Admin credential if it was ever committed; keep only Vercel environment variables.
2. Confirm `APP_URL=https://kubovista.com`, the canonical `www` redirect, and Firebase authorized domains.
3. Take and verify a production database backup.
4. Run `.github/workflows/migrate-production.yml` with the required confirmation.
5. Configure one matching `READINESS_SECRET` in Vercel Production and GitHub's `production` environment.
6. Redeploy this branch after review.
7. Run the protected readiness probe. Database, migration, account schema and Firebase Admin must all be ready.
8. Complete **Forgot password** for a migrated email, verify the email, and sign in. Test Google with a separate verified test traveler.
9. Use the displayed request reference to inspect the sanitized runtime event if either attempt fails.

## Verification performed

- `npm run check`: passed, 115/115 tests.
- `npm run lint`: passed with zero warnings.
- `npm run format:check`: passed.
- `npm run build`: passed; production site generated.
- `npm run test:coverage`: passed; aggregate lines 63.33%, branches 76.15%, functions 71.36%.
- `npm audit --omit=dev`: zero production vulnerabilities. Full development audit: two moderate and seven high transitive findings through `firebase-tools`.
- `npm run security:secrets`: no recognized secrets in tracked current files.
- `npm run test:e2e`: not executed successfully because the Chromium binary was unavailable in this workspace; no browser-flow pass is claimed.

## Audit scope

The review covered all 187 tracked paths, build/deployment configuration, workflows, migrations, API/server modules, authentication and payment clients, primary route composition, tests, asset sizes, dependency audit and current production configuration/endpoints available to the auditor. It is a code and configuration audit, not a substitute for legal/tax review, credential rotation evidence, a production database inspection, a restore drill, or a live Razorpay journey.
