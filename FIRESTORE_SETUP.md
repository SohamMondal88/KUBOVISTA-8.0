# Firebase Authentication and Firestore setup

The project uses Firebase Authentication for browser identity and Firestore for client-side profiles, trip drafts and moderated stories. Existing booking, quotation, payment and other privileged business records remain server-authoritative in PostgreSQL. Firebase ID tokens are verified by the Vercel API before protected business operations. This is a split backend; Firestore is not the canonical store for payments or bookings.

## Firebase Console

1. Select project `kubovistas-6666` and create the default Cloud Firestore database in Native mode if it does not exist. Choose the database region deliberately because it cannot be changed later.
2. Under Authentication → Sign-in method, enable Email/Password. Enable Google or Phone only if those methods are wanted and configured for the project.
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

This deploys `firestore.rules` and `firestore.indexes.json`. Review and test the rules in the Firebase Rules simulator before production. Do not deploy permissive test rules. The client module in `client/firestore.js` uses the signed-in user's UID for profile and trip-draft paths; rules restrict those records to their owner. Public story reads are limited to published stories.

## Vercel environment and release

Set server-only variables in the Vercel project settings. At minimum, configure the intended PostgreSQL connection and Firebase Admin credentials for protected APIs:

- `APP_URL`: exact production origin, such as `https://kubovista.com`
- `DATABASE_URL`: private PostgreSQL connection string
- `FIREBASE_PROJECT_ID=kubovistas-6666`
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, or the supported hosted ADC configuration
- `FIREBASE_AUTH_ENABLED=true` only after Auth providers, user migration/mapping and staging tests are complete
- `FIREBASE_GOOGLE_ENABLED=true` only if Google sign-in is enabled in Firebase Console

Never commit service-account keys or expose them as `NEXT_PUBLIC_*` or other browser variables. After changing Vercel environment variables, redeploy so the production functions use the new values. Vercel continues to host the website; Firebase Auth and Firestore are independent services.

## Validation and limits

Before launch, test sign-up, email verification, sign-in, reset, logout, protected API access, one user's profile and trip draft, cross-user Firestore denial, published-story reads, and denied writes to privileged collections. Check the browser console and network requests without recording ID tokens or credentials.

The repository includes Firebase client wiring, Auth flows, Firestore helpers and security rules. Actual project-side Auth providers, Firestore database creation, authorized domains, deployed rules, Vercel secrets and production behavior must be checked in the respective consoles; they cannot be enabled by a code change alone.
