import { query } from './db.js';

export function identityError(status, message) { return Object.assign(new Error(message), { status }); }
export function requireVerifiedIdentity(token) {
  if (!token?.uid || token.email_verified !== true || !token.email) throw identityError(403, 'Verify your Firebase email, then sign in again.');
}

// Firebase verifies the token; PostgreSQL owns the user and its server-side role.
export async function resolveFirebaseUser(token, db = { query }) {
  requireVerifiedIdentity(token);
  const result = await db.query(`INSERT INTO "user" (id, firebase_uid, name, email, "emailVerified")
    VALUES ($1,$1,$2,$3,true)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,
      "emailVerified"=true,"updatedAt"=now()
    WHERE "user".disabled_at IS NULL
    RETURNING id,name,email,"emailVerified",role,disabled_at`,
    [token.uid, String(token.name || 'Traveler').slice(0, 80), token.email]);
  if (!result.rows[0]) throw identityError(403, 'This account is closed or requires support.');
  return result.rows[0];
}
