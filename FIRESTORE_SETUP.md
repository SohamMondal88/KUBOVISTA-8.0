# Firebase identity and deny-all Firestore setup

The project uses Firebase Authentication for browser identity, App Check for application attestation, and Firebase Cloud Messaging for push delivery. PostgreSQL is authoritative for every application data domain, including profiles, settings, bookings, quotations, payments, notifications, travel companion records, editorial content and support operations. Firebase ID tokens are verified by the Vercel API before protected operations. The browser Firestore client has been removed and Firestore rules deny all client access.

## Firebase Console

1. Select project `kubovistas-6666`. A Firestore database is needed only if Firebase requires it for rules deployment; application records must not be written there.
2. Under Authentication → Sign-in method, enable Email/Password and, if intended, Google. Phone-only sign-in is not supported because server accounts require a verified email.
3. Under Authentication → Settings → Authorized domains, add the exact production Vercel hostname and the custom hostname(s) served through Hostinger DNS. Add localhost only for local development. Add preview hostnames only if preview deployments will be used for authentication.
4. Confirm the Firebase web app configuration in `client/firebase-config.js` belongs to this project. Its web API key, project ID and VAPID public key are public identifiers; never put Firebase Admin credentials in that file.

Hostinger DNS only points the custom domain at Vercel. It does not configure Firebase Authorized domains or Vercel environment variables.

## Deploy Firestore rules

From a trusted terminal with access to the project, run:

```sh
npx firebase-tools login
npx firebase-tools use kubovistas-6666
npx firebase-tools deploy --only firestore
```

This deploys `firestore.rules` and `firestore.indexes.json`. PostgreSQL is the sole owner of account, profile, settings, booking, notification, role, editorial and commerce records. The browser Firestore client has been removed and the production rules deny all browser reads and writes. Keep these deny-all rules deployed unless a future feature receives a documented ownership boundary, privacy review, migration plan and dedicated rule tests.

## Vercel environment and release

Set server-only variables in the Vercel project settings. At minimum, configure the intended PostgreSQL connection and Firebase Admin credentials for protected APIs:

- `APP_URL`: exact production origin, such as `https://kubovista.com`
- `DATABASE_URL`: private PostgreSQL connection string
- `FIREBASE_PROJECT_ID=kubovistas-6666`
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, or the supported hosted ADC configuration
- `FIREBASE_AUTH_ENABLED=true` only after Auth providers, user migration/mapping and staging tests are complete
- `FIREBASE_GOOGLE_ENABLED=true` only if Google sign-in is enabled in Firebase Console

Never commit service-account keys or expose them as `NEXT_PUBLIC_*` or other browser variables. After changing Vercel environment variables, redeploy so the production functions use the new values. Vercel hosts the website; Firebase supplies identity, attestation and push, while PostgreSQL stores application data.

## Validation and limits

Before launch, test sign-up, email verification, sign-in, reset, logout, protected API access, PostgreSQL profile/settings ownership, App Check recovery, push registration, and denial of every browser Firestore read and write. Check browser network requests without recording ID tokens or credentials.

The repository includes Firebase identity, App Check and messaging wiring plus deny-all Firestore rules. Actual Auth providers, App Check registration, authorized domains, deployed rules, Vercel secrets and production behavior must be checked in the respective consoles; they cannot be enabled by a code change alone.
