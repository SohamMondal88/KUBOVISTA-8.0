# Account and payment deployment

The code supports PostgreSQL-backed Better Auth and Razorpay quotation advances. It does not provision merchant accounts, supplier reservations or credentials. Use test mode before accepting money.

## Local setup

1. Install Node 22 and run `npm ci`.
2. Copy `.env.example` to `.env`. Keep this file private; never commit credentials.
3. Create a PostgreSQL database and set `DATABASE_URL`. Remote connections require a valid TLS certificate.
4. Set `BETTER_AUTH_URL` to the exact site origin (locally `http://localhost:3000`) and generate a random secret of at least 32 characters for `BETTER_AUTH_SECRET`.
5. Configure `RESEND_API_KEY` and a verified sender in `AUTH_EMAIL_FROM`. Email verification is required for password sign-in.
6. Run `npm run db:migrate`, then `npm run dev`.

The migration creates authentication, profiles, preferences, consultations, quotations, payments and notification tables. Run it against a new database, or review existing table compatibility first. Back up production before schema changes. Existing tables are not automatically upgraded.

## Vercel

Keep the repository root as the project root. The existing `vercel.json` builds to `dist`; the root `api/` directory supplies Node serverless functions. Static-only hosting cannot provide accounts or payments. Set the environment variables securely in Vercel for the intended environment, run the database migration against that environment, then redeploy. Do not expose secrets with a public frontend prefix. Use separate production and preview databases and payment credentials.

## Optional Google login

Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then register `https://YOUR_DOMAIN/api/auth/callback/google` as the authorized redirect URI. Email/password remains available. Do not authorize arbitrary preview origins.

## Razorpay

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` from your own merchant account. Configure a webhook at `https://YOUR_DOMAIN/api/payments/webhook` for `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`. Use the same webhook secret on both sides. Enable automatic capture in the merchant dashboard if appropriate for your business. Authorized payments are shown as pending until captured.

Checkout supports payment methods enabled for your Razorpay merchant account, including eligible cards, UPI, netbanking and wallets. This is not an integration with every payment gateway. Refunds are initiated by the operator in Razorpay; the website receives signed status updates. Partial refunds are shown as requiring review rather than claiming a full refund. It does not store card numbers or UPI credentials.

## Quotation workflow

Set `ADMIN_EMAILS` to verified operator email addresses. Sign in and open `#/admin` (also linked from an administrator's dashboard). Travelers submit a consultation from the planner. Issue a quotation with the total inclusive of taxes, advance percentage, expiry, seller identity, service scope and cancellation terms. Amounts come from this server record, never a browser-entered payment amount. Quotations lock once a payment order exists. A captured advance is not automatic supplier confirmation.

Only the quotation owner can open checkout or view their payment records. Checkout HMAC signatures and provider amount/currency/status are verified. Signed webhooks are deduplicated and cannot downgrade captured payments to failed. Transaction-bearing accounts require support-assisted closure; database constraints preserve payment records.

## Pages

`#/login`, `#/signup`, `#/verify-email`, `#/forgot-password`, `#/reset-password`, `#/welcome`, `#/dashboard`, `#/profile`, `#/settings`, `#/security`, `#/bookings`, `#/booking/ID`, `#/checkout/ID`, `#/payments`, `#/payment/STATE`, `#/notifications`, `#/saved`, `#/support`, `#/admin`.

Saved destinations and draft briefs remain device-local. Settings record preferences; this release does not send marketing campaigns, translate pages, share profiles with companions or operate a support-ticket system. Security includes password changes, session revocation, sign-out and eligible account deletion.

## Required release checks

Run `npm run check` and `npm run build`. In an isolated configured environment, verify email signup, verification delivery, reset expiry, Google callback, two-user record isolation, quotation expiry, test checkout capture/failure, duplicate webhooks, partial/full refunds and session revocation. Confirm the merchant and public business/contact/legal details before live use. No live payment or production database verification is performed by the automated repository tests.

Operational follow-up: configure monitoring, database backups, retention/deletion jobs for expired sessions and webhook records, and edge rate limits for consultation creation. Reconcile provider orders when a network interruption occurs between order creation and database commit. Do not manually change financial records without reconciliation.
