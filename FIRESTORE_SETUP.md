# Firestore setup

This repository includes `firebase.json`, `firestore.rules`, and
`firestore.indexes.json` for Firebase project `kubovistas-6666`.

1. Authenticate: `npx -y firebase-tools@latest login`.
2. Select the project: `npx -y firebase-tools@latest use kubovistas-6666`.
3. Build: `npm run build`.
4. Deploy Firestore rules and indexes: `npx -y firebase-tools@latest deploy --only firestore`.
5. Deploy Hosting: `npx -y firebase-tools@latest deploy --only hosting`.

Enable Email/Password, Google and Phone under Firebase Console → Authentication
→ Sign-in method. Add `kubovista.com`, `www.kubovista.com`, and `localhost` to
Authorized domains.

The web configuration contains public identifiers only. Keep Admin credentials
in Vercel/Firebase server environment variables. The rules are a
production-oriented prototype; test them in the Firestore Rules simulator
before broad launch.
