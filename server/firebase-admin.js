import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
// Server-only, lazy initialization. Never import this module from browser code.
export function getFirebaseAdmin() {
  const existing = getApps().find(app => app.name === 'kubovistas-admin');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'kubovistas-6666';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (Boolean(clientEmail) !== Boolean(privateKey)) throw new Error('Firebase Admin requires both client email and private key.');
  const credential = clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') })
    : applicationDefault();
  return initializeApp({ credential, projectId }, 'kubovistas-admin');
}
