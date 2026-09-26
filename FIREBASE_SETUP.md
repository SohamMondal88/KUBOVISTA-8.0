# Firebase Authentication, booking notifications and AdSense

Project: **kubovistas-6666**. Firebase Authentication is the identity provider. Admin Firestore is server-authoritative for account identity, profiles, settings, trip requests, dashboard payment history, in-app notifications and FCM devices. Legacy journal, companion-matching and business-enquiry features remain PostgreSQL-backed only when separately enabled.

## Mandatory deployment order

1. Use a Firebase test project/emulators before production. If migrating existing PostgreSQL accounts, export and retain a private backup and plan an explicit UID/data import; do not merge accounts by email automatically.
2. Firebase Console → Authentication → Sign-in method: enable Email/Password; optionally enable Google with support email. Configure a password policy matching the site's 10-character minimum. Enable email enumeration protection. Set reasonable quotas/abuse controls.
3. Authentication → Settings → Authorized domains: add the actual Vercel/custom hostname and localhost if developing locally. Keep Firebase-hosted email-action handling enabled in Templates; the emails return users to `/#/login`. Do not set a custom email-action URL without implementing its `mode`/`oobCode` handler.
4. Create Firestore in production mode. Deploy `firestore.rules` and `firestore.indexes.json` with `firebase deploy --only firestore`. Server collections are intentionally not granted browser access; Admin SDK calls are authorized by the service account.
5. Set server-only hosting environment variables: exact `APP_URL` (for example `https://kubovista.com`), `FIREBASE_PROJECT_ID=kubovistas-6666`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. Never expose or commit the service-account JSON. `DATABASE_URL` is not required for authentication or the account dashboard.
6. Node 24: run `npm ci`, `npm run check`, and `npm run build`.
7. Existing users must use **Forgot password** to establish a Firebase password; unverified users must verify their email. This command does not email your users. Communicate the change yourself after a successful staging test.
8. Set `FIREBASE_AUTH_ENABLED=true` and, if enabled in the console, `FIREBASE_GOOGLE_ENABLED=true`. Deploy the new code. Existing Better Auth cookies are ignored; everyone signs in again.

No live project settings, accounts, database migrations, secrets or deployments were changed automatically by this PR. SDK setup alone cannot enable your private Firebase project.

## Rotate and install the Firebase Admin key

The previously published key must be treated as compromised even after its text is removed from the current branch.

1. Firebase Console → Project settings → Service accounts → **Manage service account permissions**. In Google Cloud IAM → Service Accounts → the Firebase Admin SDK account → **Keys**, disable/delete the exposed key.
2. Create a new JSON key only for that service account and store the downloaded file privately. Never paste it into GitHub, chat, a public `.env` file, or browser code.
3. In Vercel → Project → Settings → Environment Variables, replace `FIREBASE_CLIENT_EMAIL` with the JSON `client_email` and `FIREBASE_PRIVATE_KEY` with the complete JSON `private_key`. The key must begin with `-----BEGIN PRIVATE KEY-----` and end with `-----END PRIVATE KEY-----`. Vercel may store real newlines or the JSON `\n` form; the server accepts both.
4. Confirm `FIREBASE_PROJECT_ID=kubovistas-6666`, `APP_URL=https://kubovista.com`, and `FIREBASE_AUTH_ENABLED=true`, then redeploy Production.
5. Rotate `PUSH_DISPATCH_SECRET` too, because the former value was committed. Generate a new 32+ byte random value and update only the Vercel secret.

## Google sign-in configuration

The login and signup screens use the current Google Identity Services library (`https://accounts.google.com/gsi/client`) to render Google's official button. The configured OAuth web client is:

`330040271750-e4s9q3gb7b2bnl3crbf5dmmv25bu6456.apps.googleusercontent.com`

The duplicated suffix from the supplied value was corrected. The retired `platform.js` / `g-signin2` integration is deliberately not loaded. Google returns an ID token to the browser; the Firebase SDK exchanges it with `GoogleAuthProvider.credential(...)` and `signInWithCredential(...)`. Protected APIs continue receiving a Firebase ID token, which Firebase Admin verifies on the server.

Before enabling the production button:

1. Confirm this OAuth web client belongs to the Google Cloud project connected to Firebase project `kubovistas-6666`. If it belongs to another project, create or select the correct Web application client in the Firebase project's Google Cloud credentials.
2. In Google Cloud Console → APIs & Services → Credentials → the OAuth web client, add the exact production origin (for example `https://kubovista.com`), the active Vercel production origin if it is used directly, and localhost only for development. Origins contain no path, hash, or trailing route.
3. Complete and publish the OAuth consent screen as appropriate for the app's audience. Add test users while the app remains in Testing.
4. In Firebase Console → Authentication → Sign-in method, enable Google and select a support email. Add the production and Vercel hostnames under Authorized domains.
5. In Vercel, set `FIREBASE_GOOGLE_ENABLED=true` only after the preceding settings are complete. The button is hidden when this flag is false.

## Authentication behavior

- Browser uses Firebase's email/password, Google popup, verification and reset SDKs. Keep me signed in selects local versus session persistence.
- Every protected API receives a Firebase bearer ID token. The server verifies signature, issuer/project, expiry and revocation with Firebase Admin, then reads or creates `users/{uid}` in Firestore. Verified email is required for account data; email matching is never used to claim another UID.
- Profiles, booking access, quote administration, payments, journal, companion matching and AI requests all use the same verified identity. Admin roles remain server-owned; the verified Firebase email or retained database role is checked against your operator configuration.
- API mutations also require an exact `APP_URL` Origin. Add preview hosts through separate preview environments, not a wildcard.
- Security page supports password change, all-device session revocation, current-device sign-out and recent-sign-in account deletion. Google account actions reauthenticate with Google. Accounts with payment records require support-assisted closure. Firebase does not expose a device-session list here.
- Deletion first disables the local account and removes device registrations, then deletes Firebase/local records. If either service fails after disabling, the account stays blocked for operator recovery. Review both systems before completing deletion; never silently re-enable it.
- Direct account-email changes in Firebase keep the UID/booking mapping; the original contact email in the local user record needs operator reconciliation. In-app email editing is not exposed.

## Account-linked booking push notifications

1. Confirm the supplied VAPID key pair under Firebase Project settings → Cloud Messaging → Web Push certificates; enable the FCM Registration API if required. HTTPS and a supported browser are required.
2. Set `FIREBASE_PUSH_ENABLED=true` and a random 32+ character `PUSH_DISPATCH_SECRET` on the server. This secret is not a Firebase key and must not appear in client code.
3. A verified traveler opens Account → Updates → **Enable on this browser**. The explicit click requests notification permission and obtains the FCM token. `/api/notifications` registers it under the server-verified user ID, never a submitted account ID. Maximum 10 devices per account.
4. New consultation, quotation, payment capture, processed refund, cancellation, confirmation and check-in notifications enter the outbox in the same transaction as the in-app notification. Relevant write handlers attempt delivery only after the business transaction commits, with a 2.5-second response wait budget; jobs left unfinished stay retryable by the scheduler.
5. Configure a trusted scheduler to POST `https://YOUR_DOMAIN/api/notifications?dispatch=1` with `Authorization: Bearer YOUR_PUSH_DISPATCH_SECRET` every five minutes. Use a secret-bearing HTTP header, not a query parameter. Alternatively run `npm run firebase:dispatch` from a secure scheduler. No additional Vercel function is added and no external scheduler account was created.
6. The dispatcher claims up to 20 jobs per call, retries transient failures up to six times within 24 hours, removes invalid tokens, expires idle devices after 30 days, and cleans seven-day delivery history. Monitor `last_error`, attempt counts and pending jobs. Disabled dispatch leaves in-app notifications available. There is no delivery guarantee: offline devices/browser restrictions may prevent push.
7. Tokens refresh on a subsequent visit only for the same account's previous opt-in. Logout removes the in-memory device registration and unsubscribes locally; if the browser lost its token, all devices for that account are removed. Revoking sessions clears all device registrations. Reassigned tokens cannot receive the former account's queued messages.
8. Push alerts show only a generic KuboVistas update and link to sign-in-protected Updates; no prices, destination or customer details are sent in the notification. The foreground handler announces a generic update; background notification payloads are shown by Firebase. The notification ID is used as the browser notification tag to reduce duplicates. A crash after FCM acceptance but before the database records success can still cause redelivery: this is at-least-once processing.

Test denied permission, unsupported browser, foreground/background delivery, refresh, logout/account switching, invalid token pruning, retry after temporary Firebase outage, and two accounts with different bookings. Never send private trip details in the Firebase Console test message.

## AdSense

The exact publisher script `ca-pub-3851312120061760` is included once in the HTML head. `/ads.txt` declares `google.com, pub-3851312120061760, DIRECT, f08c47fec0942fa0`. The build defaults to this publisher.

In AdSense, add/verify the actual domain and request review. Ads cannot be guaranteed until Google approves and serves them. Configure Privacy & messaging / a suitable consent platform before running ads where consent is required. Firebase Analytics preferences do not control AdSense; the direct publisher script connects to Google on page load.

For this hash-routed app, **manual ads on the existing public-page allowlist are the safest launch choice**: create a display ad unit and set `ADSENSE_SLOT_ID`, `ADSENSE_ENABLED=true`, and `ADSENSE_CONSENT_READY=true` only after consent setup. Keep Auto ads off until you verify placements across login, checkout, account pages and user-generated content; hash routes may not provide reliable URL exclusions. No ad-unit slot was supplied, so this PR does not invent one. If choosing Auto ads, review Google policy eligibility and placements before activation. Script placement does not promise immediate ads or income.

## Analytics

Analytics remains optional through the footer. The one Google tag in the head now uses `G-MMP3139QSB`; the old Firebase Analytics initialization and `G-C0ZK56K9YQ` measurement ID were removed. The Google tag script loads on page load, with Analytics disabled and consent denied by default; opted-in public-page events are sent by the preference controller. Confirm this is the Analytics property you want to use. Disable Enhanced measurement in the Analytics stream to prevent automatic form/history tracking from bypassing the sanitized public page-view logic. Do not add a duplicate gtag/GTM setup. Analytics and AdSense have separate preferences and data collection.

## Release acceptance and rollback

Run local tests/build, then staging tests with two real Firebase test accounts: signup, verification, reset, Google popup, old-account password reset and preserved booking IDs, revoked/expired-token denial, cross-account API access, operator-only quotes, logout, notification retry and payment test-mode capture. Also test a deleted/disabled user and an email conflict. Inspect browser/network logs without recording tokens.

Keep the last deployment and database backup. If cutover fails, disable `FIREBASE_AUTH_ENABLED`, pause bookings, and repair mapping rather than dropping identity/financial tables. Restoring the old application requires its former auth configuration; Firebase password changes do not update old password hashes. Do not present a rollback as lossless authentication synchronization.

Dependency audit currently reports two moderate transitive Admin SDK findings (`uuid`/`gaxios`, GHSA-w5hq-g745-h8pq); no compatible automatic update resolved them. Track upstream fixes. Do not use force-upgrades without compatibility checks.

References: https://firebase.google.com/docs/auth/web/manage-users ; https://firebase.google.com/docs/auth/admin/verify-id-tokens ; https://firebase.google.com/docs/cloud-messaging/manage-tokens ; https://firebase.google.com/docs/cloud-messaging/send/admin-sdk ; https://support.google.com/adsense/answer/7584263 ; https://support.google.com/adsense/answer/9261307

## Checks performed for this change

77 automated tests cover existing features plus Firebase token rejection, legacy mapping/ownership, SQL migration and transactional notification queue behavior using embedded PostgreSQL, retries, device reassignment and Google tag consent/sanitization. Production build passed. Chromium checks covered login/preferences at 375, 768 and 1366 pixels and a mocked Firebase SDK login → bearer API access → notification controls → logout flow, including a delayed stale account-route response. External providers were mocked/blocked in browser tests; actual Firebase login/email/push delivery, Razorpay production flows and AdSense approval/serving remain owner staging checks.
