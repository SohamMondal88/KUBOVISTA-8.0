import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';

// Vercel values are sometimes pasted from .env files with surrounding quotes.
// Normalize that representation without ever logging or exposing the credential.
export function normalizeFirebaseAdminValue(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return undefined;
  let normalized = value.trim();
  const quoted = (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"));
  if (quoted) normalized = normalized.slice(1, -1).trim();
  if (multiline) normalized = normalized.replace(/\\n/g, '\n');
  return normalized || undefined;
}

// Server-only, lazy initialization. Never import this module from browser code.
export function getFirebaseAdmin() {
  const existing = getApps().find(app => app.name === 'kubovistas-admin');
  if (existing) return existing;
  const projectId = normalizeFirebaseAdminValue(process.env.FIREBASE_PROJECT_ID) || 'kubovistas-6666';
  const clientEmail = normalizeFirebaseAdminValue(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizeFirebaseAdminValue(process.env.FIREBASE_PRIVATE_KEY, { multiline: true });
  if (Boolean(clientEmail) !== Boolean(privateKey)) throw new Error('Firebase Admin requires both client email and private key.');
  if (privateKey && !/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/.test(privateKey)) {
    throw new Error('Firebase Admin private key format is invalid.');
  }
  const credential = clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();
  return initializeApp({ credential, projectId }, 'kubovistas-admin');
}
