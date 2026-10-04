# P0 payments release and recovery

## Current deployment state

Checkout is disabled unless all three server flags are explicitly true: `PAYMENTS_ENABLED`, `BUSINESS_DETAILS_VERIFIED`, and `LEGAL_TAX_APPROVED`. Keep them false until the owner has approved the verified disclosures, a qualified professional has reviewed the terms and taxes, and the test checklist below has passed. The flags are operational attestations, not substitutes for those reviews.

## Production prerequisites

1. Supply the actual legal seller name, business registration and applicable tax details, full service address, reachable customer support and grievance contacts, and the exact supplier/merchant-of-record arrangements. Publish them in the contact, terms, grievance, quotation, and payment pages after verification. The existing contact email, phone and location in `.env.example` are examples until checked against business records.
2. Ask an India-qualified legal and tax professional to review the checkout, deposits, cancellation tiers, refund disclosures, invoice/tax treatment, service scope, privacy/retention and consumer grievance process. Record the approved versions and publication dates. Do not assert approval from code alone.
3. Configure distinct Razorpay test and live credentials, webhook secret, URL `https://<domain>/api/payments/webhook`, and payment/refund webhook events. Ensure automatic capture is configured as expected. Store secrets only in the deployment environment.
4. Restore or verify `DATABASE_URL`, Firebase Admin credentials and `APP_URL`. For the first administrator only, temporarily set `ADMIN_BOOTSTRAP_ENABLED=true` and `ADMIN_BOOTSTRAP_EMAIL` locally, run `npm run admin:bootstrap`, then immediately remove both values. Runtime email allowlists do not confer privileges. Enroll Firebase MFA before opening any administrator route. Assign every later role through `POST /api/admin/roles`; grants and revocations are database-audited.
5. Confirm payment-function count is within the Vercel Hobby cap (currently 12 API entries). Apply migrations on the same database the deployment will use.

## Migration and rollout

1. Keep checkout off (`PAYMENTS_ENABLED=false`) and take a timestamped, encrypted PostgreSQL backup using the managed provider's supported backup/export process. Verify the backup completed before changing schema.
2. Apply migrations only through the protected production migration workflow. Confirm the `schema_migrations` checksums, then inspect the new `payment_attempts` table and payment foreign key before resuming writes.
3. PostgreSQL is authoritative for profiles, settings, bookings, notifications, payments, refunds, roles, and audit records. Firebase supplies identity, App Check and push only; keep deny-all browser Firestore rules deployed. Historical exports are evidence, not an active application datastore, and must not be re-imported without a separately reviewed migration plan.
4. Compare existing PostgreSQL payment/order identifiers and amounts with Razorpay exports. Reconcile one booking at a time through the authenticated operator action; investigate every mismatch and never discard or overwrite financial history.
5. Run the scenarios below in Razorpay test mode with fresh bookings, then check published business details and review records. Enable the three flags only when the owner has approved live collection.

## Payment acceptance checks

- Two customers create separate bookings; each sees only their own booking, notifications and payment history. Guest/admin routes deny inappropriate access.
- Operator issues quote v1 and then v2; the customer sees v2. An old tab with v1 fails before an order is created. Every order links to a stored acceptance and quote version.
- Make a test deposit and submit the checkout callback and signed webhook in both orders, twice each. Exactly one booking transition and notification occurs; payment ID, currency, order and amount agree with Razorpay. An authorized-only attempt stays pending.
- A failed attempt is checked against Razorpay automatically. A definitively failed or expired attempt may create a new numbered attempt within the rate and attempt limits; ambiguous orders are recovered by receipt and preserved for reconciliation. A captured order records capture and notifies once.
- Operator confirms supplier booking and check-in at/after scheduled time. The balance becomes available only then and is charged at the quoted amount. Cancellation calculation follows the accepted policy.
- Cancel an eligible deposit booking. The operator reviews the recorded deduction and clicks Process refund. Repeating the request uses the same persisted Razorpay idempotency key. Webhook and reconciliation update the refund ledger; processed amount is visible in payment history. Test partial, pending, failed, duplicate and reordered refund events.
- Run `npm run check` and `npm run build`. Test phone/tablet/desktop layouts, account navigation, browser reloads, popup dismissal, and slow/offline provider responses against the staging deployment.

These are acceptance procedures, not evidence of a completed live transaction. There are no production Razorpay credentials, tax records, or staging URL in this repository.

## Incident and rollback

- If order/amount/status mismatches, duplicate captures, refund drift, database outage, or webhook errors appear: set `PAYMENTS_ENABLED=false`, keep the signed webhook endpoint active, preserve logs and provider event IDs, and stop operator refund clicks. Do not restore an old database over newer real transactions.
- Compare `payments`, `payment_refunds`, `payment_webhook_events`, `booking_quotes`, `quote_acceptances`, and `audit_logs` with Razorpay order/payment/refund exports. Use the admin reconcile action for one booking at a time after checking the provider. Ambiguous refunds retain the same request key; never issue a fresh one based on a timeout.
- Redeploy the previous application revision only while checkout is disabled. For schema or data recovery, first capture a fresh database backup and restore the pre-change backup to an isolated instance; replay and verify later provider events before any production cutover. Test a backup restore regularly and record its timestamp and owner.
- Keep an incident timeline with UTC timestamps, affected bookings, webhook IDs, provider ticket, operator decisions and customer communications. Rotate exposed keys and replay failed webhook deliveries only after verifying signatures. Re-enable checkout after a second operator checks all affected amounts and the rollout tests pass.
