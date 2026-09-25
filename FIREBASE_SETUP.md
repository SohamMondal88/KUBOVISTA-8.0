# Firebase setup for KuboVistas

Project: `kubovista`. This PR adds the supplied web config and public VAPID key, the npm web SDK, optional Analytics, web push SDK helpers/service worker, and a lazy server-only Admin SDK helper. It does not migrate existing Better Auth users, PostgreSQL bookings, Razorpay payments or host the Node API on Firebase.

## 1. Build and deploy the website

Use Node 24 and run `npm ci`, `npm run check`, then `npm run build`. Merge/review this PR and redeploy the existing Vercel project normally. The browser bundle is generated with esbuild into `dist/`; no bare npm imports or Admin credentials are shipped. `npm run dev` builds the same Firebase assets locally. Firebase is an additional service; Firebase Hosting is not required.

Do not run `firebase init` over this repository and accept overwrite prompts. A static Firebase Hosting deployment of `dist` alone cannot run the existing `/api/*` routes, authentication or payment webhooks. A Hosting migration needs a Cloud Run/Functions backend and explicit rewrites first. No `firebase deploy` is needed for this SDK integration, and no Firebase resources or production rules have been deployed by this change.

## 2. Analytics console setup and acceptance

1. Open https://console.firebase.google.com/project/kubovista/settings/integrations and confirm the Analytics property/web stream matches `G-C0ZK56K9YQ`.
2. In Google Analytics Admin → Data streams → the web stream, turn **Enhanced measurement OFF**. This implementation sends sanitized public-page events explicitly. Automatic history/form/search tracking could otherwise capture private URLs or form activity. Do not add a second gtag/Google Tag Manager installation that bypasses these preferences. Review Google Signals and data retention settings for your business.
3. Open the deployed website in a fresh browser. Before consent, no Analytics module/script should load and no Google Analytics requests should occur. The Firebase core module initializes locally.
4. Footer → Analytics preferences → allow → Save. Public destination/journal/about page visits should appear in Realtime. Account/payment/reset URLs are excluded from this integration's page-view events. Blocking extensions or unsupported browsers can prevent reporting.
5. Disable consent and ensure later public-page visits send no events. Reload and ensure it remains disabled. Previously collected data/cookies are not retroactively deleted. Browser storage denial leaves collection off.

The web API key is a public Firebase identifier, not permission to read databases. Review API restrictions carefully; do not disable APIs required by Firebase. Never rely on hiding this config as access control.

## 3. Cloud Messaging setup (device testing foundation)

Confirm Project settings → Cloud Messaging → Web Push certificates contains the supplied VAPID key pair. Enable the FCM Registration API if requested by Firebase. The site must use HTTPS (localhost is suitable for development). Browser support/OS notification settings apply.

The compiled `/firebase-client.js` exports `requestPushToken()` and `disablePush()`. Call the first only from an explicit user click; it requests browser permission, registers `/firebase-messaging-sw.js` in a dedicated scope and obtains an FCM token. It does not persist/log the token, attach it to a user, or promise booking notifications.

For an owner-only browser test, use a temporary button in DevTools on your deployed site:

```js
const firebase = await import('/firebase-client.js');
const button = document.createElement('button');
button.textContent = 'Enable test notifications';
button.onclick = async () => {
  try {
    const token = await firebase.requestPushToken();
    // Copy privately for Firebase Console's Send test message dialog.
    await navigator.clipboard.writeText(token);
    button.textContent = 'Test token copied';
  } catch (error) { button.textContent = error.message; }
};
document.body.append(button);
```

Paste the token into Firebase Console Messaging → Send test message, background the tab and test a **notification payload**. No foreground toast is implemented. Do not publish tokens, private data in notifications, or service-account credentials. When finished run `await firebase.disablePush()` and remove the temporary button; browser notification permission can separately be revoked in site settings.

Before customer-facing booking notifications: implement an authenticated token registration/deletion endpoint with account ownership, explicit opt-in, logout/account-deletion cleanup, token refresh/pruning, authorized server sends and delivery tests. The current in-app notification system remains the production notification channel. This PR deliberately adds no extra Vercel serverless function.

## 4. Admin SDK credentials (optional; needed for privileged future operations)

The supplied `require('path/to/serviceAccountKey.json')` is a placeholder, not an actual credential. Do not commit a downloaded key or put it in browser configuration. `server/firebase-admin.js` exports `getFirebaseAdmin()` using ES modules, matching this repository.

On Vercel server environment settings, enter privately:

- `FIREBASE_PROJECT_ID=kubovista`
- `FIREBASE_CLIENT_EMAIL` from your service account
- `FIREBASE_PRIVATE_KEY` from the same account (literal escaped newlines or actual newlines supported)

Alternatively on a trusted server use Application Default Credentials / `GOOGLE_APPLICATION_CREDENTIALS` pointing to a private file outside the repository. Use a least-privilege account. Initialization is lazy; missing credentials do not break the public website. Never paste the private key into chat. No Admin call is made just by loading the browser website.

## 5. Authentication, storage and budget

Adding Firebase is not an authentication migration. The existing signup/login screens still use Better Auth and PostgreSQL. Enabling Firebase Auth in the console will not change that. A future migration must map Firebase UIDs to current user records, verify ID tokens server-side, update every protected API, preserve booking ownership and test two-user isolation. Do not simply swap the login widget.

No Firestore collection, Storage upload, public rules, billing plan upgrade or paid resource was created. If you later enable these products, define ownership-based rules and budget alerts first. The storageBucket value alone does not provision a bucket or grant upload access.

## References

- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/reference/js/analytics
- https://firebase.google.com/docs/cloud-messaging/web/get-started
- https://firebase.google.com/docs/cloud-messaging/web/receive-messages
- https://firebase.google.com/docs/admin/setup

## Verification record

Local checks: 62 Node tests passed; production build passed; browser bundle and service-worker routes returned 200; server helper and environment routes returned 404; generated public assets contained no Admin SDK/private-key configuration. Live Analytics reporting, notification delivery, private Admin credentials and browser layout have not been verified against the Firebase project.

Dependency audit after installation and `npm audit fix --ignore-scripts`: two moderate findings (`uuid` and its dependent `gaxios`) remain in the Admin SDK dependency tree, advisory GHSA-w5hq-g745-h8pq. No compatible automatic fix was applied. Track upstream updates before activating privileged production Firebase services; do not use `npm audit fix --force` without compatibility testing.
