# P0 production activation runbook

Payments and authentication must stay fail-closed until every gate below has
evidence. Configuration presence is not service health.

## 1. Rotate exposed credentials before any deployment

The repository history previously contained a Firebase Admin private key and a
credentialed PostgreSQL URL. Treat every credential ever pasted into Git, issue
threads, chat, CI output, screenshots, or deployment logs as compromised.

1. Revoke and replace the Firebase service-account key in Google Cloud IAM.
2. Rotate the PostgreSQL role password and invalidate the old connection string.
3. Rotate the Razorpay key secret and webhook secret in the Razorpay Dashboard.
4. Replace the corresponding Vercel Production, Preview, and Development secrets.
5. Rotate any other value exposed beside them, including dispatch/readiness keys.
6. Redeploy only after the old credentials are confirmed unusable.

Do not put replacement values in `.env.example`, GitHub variables, PR comments,
or source files. Restrict production environment access and enable GitHub secret
scanning plus push protection in repository security settings.

## 2. Coordinated Git history purge

History rewriting affects every contributor and open pull request. Freeze merges,
take a protected mirror backup, and coordinate this operation with the repository
owner. Rotation must happen first because rewriting history does not revoke a key.

```sh
git clone --mirror git@github.com:SohamMondal88/KUBOVISTA-8.0.git kubovista-purge.git
cd kubovista-purge.git
git filter-repo --path .env.example --invert-paths --force
git push --force --mirror
```

Re-add the current sanitized `.env.example` in a clean clone. If secrets appeared
in other paths, use a reviewed replacement map instead of removing unrelated
history. Expire cached artifacts, close/rebase stale PRs, require every contributor
to re-clone, and run `npm run security:secrets:history`. Forks and external clones
cannot be purged centrally, which is why rotation is mandatory.

## 3. Production environment gates

Set these as encrypted Vercel Production variables:

- `APP_URL=https://kubovista.com` and `APP_ORIGINS=https://kubovista.com`
- `READINESS_SECRET` with at least 32 random characters
- rotated Firebase Admin credentials and `FIREBASE_AUTH_ENABLED=true`
- pooled `DATABASE_URL` and a conservative `DATABASE_POOL_MAX`
- live Razorpay key ID/secret and rotated webhook secret
- verified legal name, address, contact, grievance, and tax disclosures
- `BUSINESS_DETAILS_VERIFIED=true` and `LEGAL_TAX_APPROVED=true` only after evidence

Keep `PAYMENTS_ENABLED=false` until migrations, readiness, webhook delivery, legal
review, and the controlled test journey pass. Test keys are rejected in Vercel
Production by code.

## 4. Migration and readiness

1. Take and verify a database backup.
2. Run the protected **Migrate production database** workflow with the required
   confirmation. It must apply `012_p0_critical_blockers.sql`.
3. Add `READINESS_SECRET` to the GitHub `production` environment.
4. Run **Production readiness probe** and retain its JSON artifact.
5. Confirm a deliberately invalid token receives `401`, while a valid token
   checks PostgreSQL, the expected migration/schema, and Firebase Admin remotely.

The public `/api/config` endpoint intentionally reports generic configuration,
not internal component health.

## 5. Controlled Razorpay test journey

Use a production-like Preview with Razorpay test keys, an isolated database, and
`PAYMENTS_TEST_MODE=true`. Record request IDs and provider IDs, never credentials.

| Scenario                 | Required evidence                                                       |
| ------------------------ | ----------------------------------------------------------------------- |
| Successful deposit       | booking → order → modal → capture → webhook → confirmation → invoice    |
| Cancellation             | modal closes, no paid state, retry remains available                    |
| Failed payment           | failure is recorded; a controlled new attempt can be created            |
| Duplicate submit         | one active provider order and one captured payment                      |
| Delayed/replayed webhook | signature verified; processing remains idempotent                       |
| Ambiguous order          | receipt reconciliation links the provider order                         |
| Partial refund           | stable attempt receipt, webhook/reconciliation, correct remaining total |
| Ambiguous refund         | no second POST; admin receives reconcile-only response                  |

After the matrix passes, configure the production webhook URL and events, verify
delivery signatures, obtain compliance approval, set `PAYMENTS_ENABLED=true`, and
redeploy. Run a low-value controlled live transaction and refund with an authorized
operator before general availability.

## 6. Incident rollback

Set `PAYMENTS_ENABLED=false` and redeploy to hide checkout immediately. Do not
delete payment/refund attempts. Reconcile provider state, preserve audit logs, and
restore from a verified point only under the documented recovery procedure.
