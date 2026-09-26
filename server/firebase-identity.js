import { firestore, plain, serverTimestamp } from './firestore.js';
export function identityError(status, message) { return Object.assign(new Error(message), { status }); }
export function requireVerifiedIdentity(token) {
  if (!token?.uid || token.email_verified !== true || !token.email) throw identityError(403, 'Verify your Firebase email, then sign in again.');
}
// The Firebase UID is the canonical account identifier in both Auth and Firestore.
export async function resolveFirebaseUser(token, db = firestore()) {
  requireVerifiedIdentity(token);
  const ref = db.collection('users').doc(token.uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? plain(snapshot.data()) : null;
    if (existing?.disabled_at) throw identityError(403, 'This account is closed or requires support.');
    const user = {
      id: token.uid,
      firebaseUid: token.uid,
      name: String(existing?.name || token.name || 'Traveler').slice(0, 80),
      email: token.email,
      emailVerified: true,
      role: existing?.role || 'user',
      created_at: existing?.created_at || serverTimestamp(),
      updated_at: serverTimestamp()
    };
    transaction.set(ref, user, { merge: true });
    return { ...user, created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
  });
}
