# P0 payments release and recovery

## Current deployment state

Checkout is disabled unless all three server flags are explicitly true: `PAYMENTS_ENABLED`, `BUSINESS_DETAILS_VERIFIED`, and `LEGAL_TAX_APPROVED`. Keep them false until the owner has approved the verified disclosures, a qualified professional has reviewed the terms and taxes, and the test checklist below has passed. The flags are operational attestations, not substitutes for those reviews.

## Production prerequisites

1. Supply the actual legal seller name, business registration and applicable tax details, full service address, reachable customer support and grievance contacts, and the exact supplier/merchant-of-record arrangements. Publish them in the contact, terms, grievance, quotation, and payment pages after verification. The existing contact email, phone and location in `.env.example` are examples until checked against business records.
2. Ask an India-qualified legal and tax professional to review the checkout, deposits, cancellation tiers, refund disclosures, invoice/tax treatment, service scope, privacy/retention and consumer grievance process. Record the approved versions and publication dates. Do not assert approval from code alone.
3. Configure distinct Razorpay test and live credentials, webhook secret, URL `https://<domain>/api/payments/webhook`, and payment/refund webhook events. Ensure automatic capture is configured as expected. Store secrets only in the deployment environment.
4. Restore or verify `DATABASE_URL`, Firebase Admin credentials and `APP_URL`. Bootstrap a verified administrator through the narrow `ADMIN_EMAILS` allowlist. Then assign server-owned roles with `POST /api/admin/roles` using a fresh administrator session; each change is audited. Do not rely on a self-editable profile field. `ADMIN_EMAILS` is a temporary bootstrap allowlist and should be narrow.
5. Confirm payment-function count is within the Vercel Hobby cap (currently 12 API entries). Apply migrations on the same database the deployment will use.

## Import and rollout

1. Turn off checkout (`PAYMENTS_ENABLED=false`) and pause booking writes briefly. Export a timestamped PostgreSQL custom-format backup with `pg_dump --format=custom --no-owner --file=<secure-backup-file> "$DATABASE_URL"`. Create a Firestore export in Google Cloud and verify its operation completes before import. Keep backups encrypted and access restricted.
2. Apply `npm run db:migrate`. Run `npm run commerce:migrate` to see Firestore record counts, then `npm run commerce:migrate -- --apply` to import historical users, bookings, payments, and notices. This operation is idempotent by document ID but does not silently overwrite existing PostgreSQL rows. Investigate any mismatched IDs, statuses, amounts, UUIDs, or provider order IDs manually; do not discard financial data.
3. Review imported quotation records: legacy Firestore quotes have no immutable version and cannot create new checkout orders. Reissue any unpaid quote from the operator screen with verified seller and policy details. For historical payments, compare the imported data to Razorpay and invoke admin `POST /api/admin/refund` with `{"bookingId":"...","action":"reconcile"}` for each booking with a provider order.
4. Validate SQL row counts, owner IDs and amounts against the Firestore export, then resume bookings. Keep Firestore export available for audit; Firestore remains the storage for profiles/settings and Firebase remains the identity and push provider. The canonical booking, notification, payment, refund, role, and audit records are PostgreSQL.
5. Run the scenarios below in Razorpay test mode with test credentials and fresh bookings; then check published business details and review records. Enable the three flags only when the owner has approved live collection.

## Payment acceptance checks

- Two customers create separate bookings; each sees only their own booking, notifications and payment history. Guest/admin routes deny inappropriate access.
- Operator issues quote v1 and then v2; the customer sees v2. An old tab with v1 fails before an order is created. Every order links to a stored acceptance and quote version.
- Make a test deposit and submit the checkout callback and signed webhook in both orders, twice each. Exactly one booking transition and notification occurs; payment ID, currency, order and amount agree with Razorpay. An authorized-only attempt stays pending.
- A failed attempt cannot create a second payable order until provider reconciliation. An admin reconcile for an unpaid order re-enables its original order; for a captured order it records capture and notifies once.
- Operator confirms supplier booking and check-in at/after scheduled time. The balance becomes available only then and is charged at the quoted amount. Cancellation calculation follows the accepted policy.
- Cancel an eligible deposit booking. The operator reviews the recorded deduction and clicks Process refund. Repeating the request uses the same persisted Razorpay idempotency key. Webhook and reconciliation update the refund ledger; processed amount is visible in payment history. Test partial, pending, failed, duplicate and reordered refund events.
- Run `npm run check` and `npm run build`. Test phone/tablet/desktop layouts, account navigation, browser reloads, popup dismissal, and slow/offline provider responses against the staging deployment.

These are acceptance procedures, not evidence of a completed live transaction. There are no production Razorpay credentials, tax records, or staging URL in this repository.

## Incident and rollback

- If order/amount/status mismatches, duplicate captures, refund drift, database outage, or webhook errors appear: set `PAYMENTS_ENABLED=false`, keep the signed webhook endpoint active, preserve logs and provider event IDs, and stop operator refund clicks. Do not restore an old database over newer real transactions.
- Compare `payments`, `payment_refunds`, `payment_webhook_events`, `booking_quotes`, `quote_acceptances`, and `audit_logs` with Razorpay order/payment/refund exports. Use the admin reconcile action for one booking at a time after checking the provider. Ambiguous refunds retain the same request key; never issue a fresh one based on a timeout.
- Redeploy the previous application revision only while checkout is disabled. For schema or data recovery, first capture a fresh database backup and restore the pre-change backup to an isolated instance; replay and verify later provider events before any production cutover. Test a backup restore regularly and record its timestamp and owner.
- Keep an incident timeline with UTC timestamps, affected bookings, webhook IDs, provider ticket, operator decisions and customer communications. Rotate exposed keys and replay failed webhook deliveries only after verifying signatures. Re-enable checkout after a second operator checks all affected amounts and the rollout tests pass.
