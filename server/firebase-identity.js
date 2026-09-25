import { randomUUID } from 'node:crypto';
export function identityError(status, message) { return Object.assign(new Error(message), { status }); }
export function requireVerifiedIdentity(token) {
  if (!token?.uid || token.email_verified !== true || !token.email) throw identityError(403, 'Verify your Firebase email, then sign in again.');
}
// Dependency injection permits tests of ownership without real account credentials.
export async function resolveFirebaseUser(token, transaction) {
  requireVerifiedIdentity(token);
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['firebase-user:' + token.uid]);
    const existing = await client.query('SELECT * FROM "user" WHERE firebase_uid=$1 FOR UPDATE', [token.uid]);
    if (existing.rows[0]) {
      if (existing.rows[0].disabled_at) throw identityError(403, 'This account is closed or requires support.');
      // Firebase is the authority for email verification. Never inherit an old email's admin access.
      return { ...existing.rows[0], email: token.email, emailVerified: true, firebaseUid: token.uid };
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['firebase-email:' + token.email.toLowerCase()]);
    const legacy = await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1)', [token.email]);
    if (legacy.rowCount) throw identityError(409, 'An existing account needs migration. Contact KuboVistas support to preserve your bookings.');
    const result = await client.query('INSERT INTO "user" (id,name,email,"emailVerified",firebase_uid) VALUES ($1,$2,$3,true,$4) RETURNING *', [randomUUID(), String(token.name || 'Traveler').slice(0,80), token.email, token.uid]);
    return { ...result.rows[0], firebaseUid: token.uid };
  });
}
