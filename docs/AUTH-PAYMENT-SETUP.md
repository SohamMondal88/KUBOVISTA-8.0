# Account and Razorpay recovery

## Account storage

The public config endpoint reports configured variables, not database reachability.
A valid Firebase session still needs a migrated PostgreSQL account. The session
resolver now respects explicit firebase_uid mappings, preserves database roles,
and refuses to merge accounts solely because their email addresses match.

1. Back up the production database.
2. Supply the deployment's DATABASE_URL to the migration process and run
   npm run db:migrate. The checkout constraint migration is now repeatable.
3. For legacy accounts, run the existing Firebase migration in dry-run mode,
   review the report, then apply it using the documented migration procedure.
   An existing Firebase user with a different UID needs an operator-verified
   mapping; do not delete accounts or infer ownership from an email alone.
4. Verify FIREBASE_AUTH_ENABLED, Firebase Admin credentials, and APP_URL
   (the exact canonical browser origin). Check server logs for the
   "Account session unavailable" code. Never publish tokens or private keys.
5. Sign in with a verified account and test /api/auth/get-session, dashboard,
   a profile read, and sign-out on the actual deployment.

## Checkout

Existing equivalent endpoints are POST /api/payments/create-order and
POST /api/payments/verify. They require a Firebase bearer token; mutations
also enforce the configured origin and App Check where enabled.
Amounts come from an accepted server quotation, never a client price.

Local setup: npm ci, create an ignored .env, then npm run dev.
The supplied test keys are local only; .env is never deployed by Git.

In the Vercel environment being tested, configure:
- DATABASE_URL and Firebase authentication settings
- RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from the same Razorpay mode
- RAZORPAY_WEBHOOK_SECRET for /api/payments/webhook
- PAYMENTS_ENABLED=true only after all existing readiness requirements are met
- BUSINESS_DETAILS_VERIFIED and LEGAL_TAX_APPROVED must reflect real review
- PUBLIC_LEGAL_NAME, PUBLIC_BUSINESS_ADDRESS, PUBLIC_CONTACT_EMAIL,
  PUBLIC_GRIEVANCE_EMAIL, PUBLIC_TAX_DISCLOSURE

Redeploy after changing environment variables. Do not set readiness flags just
to bypass validation. Use a separate test database/deployment for test keys so
test captures cannot be confused with real booking payments. Rotate any secret
shared in chat before reuse. Never expose the secret in public build variables.

Create a test trip and issue a current quotation with the operator tools.
Accept terms in checkout and pay with Razorpay's test methods.
Verify success, dismissal, provider failure, signature mismatch, missing fields,
expired quote, duplicate callbacks, and webhook-before-callback ordering.
Authorized payments remain pending; only captured payments acknowledge receipt.
Final supplier confirmation remains separate. Test balance payment only after
operator-verified check-in; test refunds and reconciliation using existing tools.

A lost verification response now shows pending, not a false failed-charge claim.
Consult payment history/webhook reconciliation before retrying a payment.

## Membership and manual payments

Membership prices remain proposals and the page promises no billing. Recurring
subscriptions are not enabled: approved plan IDs, entitlements, renewal/cancel
terms and subscription lifecycle handling must be supplied before launch.
Do not send proposed membership prices through booking checkout.

The supplied payment handle https://razorpay.me/@kubovista6199 is an external
manual payment route, not an order-bound callback. It must not auto-confirm a
booking or activate membership. Prefer the integrated quoted booking checkout.
