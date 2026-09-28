import { query } from './db.js';

export function identityError(status, message) { return Object.assign(new Error(message), { status }); }
export function requireVerifiedIdentity(token) {
  if (!token?.uid || token.email_verified !== true || !token.email) throw identityError(403, 'Verify your Firebase email, then sign in again.');
}

// Link only by an operator-established UID, never by an email match.
export async function resolveFirebaseUser(token, db = { query }) {
  requireVerifiedIdentity(token);
  const values = [token.uid, String(token.name || 'Traveler').slice(0, 80), token.email];
  try {
    const mapped = await db.query(`UPDATE "user" SET name=$2,email=$3,"emailVerified"=true,"updatedAt"=now()
      WHERE firebase_uid=$1 AND disabled_at IS NULL
      RETURNING id,name,email,"emailVerified",role,disabled_at`, values);
    if (mapped.rows[0]) return mapped.rows[0];
    const result = await db.query(`INSERT INTO "user" (id,firebase_uid,name,email,"emailVerified")
      VALUES ($1,$1,$2,$3,true)
      ON CONFLICT (id) DO UPDATE SET firebase_uid=EXCLUDED.firebase_uid,
        name=EXCLUDED.name,email=EXCLUDED.email,"emailVerified"=true,"updatedAt"=now()
      WHERE "user".disabled_at IS NULL AND ("user".firebase_uid IS NULL OR "user".firebase_uid=EXCLUDED.firebase_uid)
      RETURNING id,name,email,"emailVerified",role,disabled_at`, values);
    if (!result.rows[0]) throw identityError(403, 'This account is closed or requires support.');
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw identityError(409, 'This identity needs account migration. Contact support to restore access; do not create another account.');
    if (['42P01', '42703'].includes(error.code)) throw identityError(503, 'Account storage needs an update. Please contact support.');
    throw error;
  }
}
