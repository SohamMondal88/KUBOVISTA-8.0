import { getAuth as firebaseAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from './firebase-admin.js';
import { firestoreConfigured } from './firestore.js';
import { resolveFirebaseUser } from './firebase-identity.js';
import { json } from './http.js';
export function authConfigured() {
  return firestoreConfigured() && Boolean(process.env.APP_URL);
}
export function getAuth() { return firebaseAuth(getFirebaseAdmin()); }
export function originAllowed(req) {
  try { return req.headers.origin === new URL(process.env.APP_URL).origin; } catch { return false; }
}
export async function readFirebaseSession(req, {configured=authConfigured, verify=(token,revoked)=>getAuth().verifyIdToken(token,revoked), resolve=decoded=>resolveFirebaseUser(decoded)} = {}) {
  const header = req.headers.authorization || '';
  if (!/^Bearer [^\s]+$/.test(header)) return null;
  if (!configured()) throw Object.assign(new Error('Firebase accounts are not configured yet.'), { status: 503 });
  let decoded;
  try { decoded = await verify(header.slice(7), true); }
  catch (error) {
    if (['auth/id-token-expired','auth/id-token-revoked','auth/invalid-id-token','auth/argument-error','auth/user-disabled','auth/user-not-found'].includes(error.code)) return null;
    console.error('Firebase identity verification failed', {
      code: error?.code || error?.name || 'unknown',
      message: String(error?.message || 'No error message').slice(0, 240)
    });
    throw Object.assign(new Error('Identity verification is temporarily unavailable.'), { status: 503 });
  }
  const user = await resolve(decoded);
  return { user, authTime: decoded.auth_time, firebaseUid: decoded.uid };
}
export const getSession=req=>readFirebaseSession(req);
export async function requireSession(req, res) {
  if (!['GET','HEAD'].includes(req.method) && !originAllowed(req)) { json(res,403,{error:'Request origin is not allowed.'}); return null; }
  try {
    const session = await getSession(req);
    if (!session) { json(res,401,{error:'Please sign in to continue.'}); return null; }
    return session;
  } catch(error) {
    json(res, error.status || 503, {error: error.status ? error.message : 'Account service is unavailable. Please try again.'});
    return null;
  }
}
export function isAdmin(session) {
  const configured=(process.env.ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  return session?.user?.emailVerified === true && (session?.user?.role === 'admin' || configured.includes(session?.user?.email?.toLowerCase()));
}
