import { createHash, timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdmin } from './firebase-admin.js';
import { getPool } from './db.js';

export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
export function validPushToken(token) { return typeof token === 'string' && token.length >= 30 && token.length <= 4096 && /^[A-Za-z0-9_:\-]+$/.test(token); }
export function dispatcherAuthorized(header, secret = process.env.PUSH_DISPATCH_SECRET) {
  if (!secret || secret.length < 32 || typeof header !== 'string') return false;
  const expected = Buffer.from('Bearer ' + secret), actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function privatePushPayload(delivery, origin) {
  return { token: delivery.token, notification: { title: 'KuboVistas trip update', body: 'You have a new account update. Sign in to view it.' }, data: { notificationId: String(delivery.notification_id) }, webpush: { headers: { TTL: '3600' }, notification: { tag: String(delivery.notification_id) }, fcmOptions: { link: origin + '/account/notifications' } } };
}
export async function dispatchPush({ userId = null, pool = getPool(), send = message => getMessaging(getFirebaseAdmin()).send(message) } = {}) {
  if (process.env.FIREBASE_PUSH_ENABLED !== 'true') return { enabled: false, sent: 0 };
  const origin = new URL(process.env.APP_URL).origin;
  const { rows } = await pool.query(`UPDATE firebase_push_deliveries d SET locked_until=now()+interval '2 minutes', attempts=attempts+1
    FROM (SELECT id FROM firebase_push_deliveries WHERE sent_at IS NULL AND available_at<=now()
      AND (locked_until IS NULL OR locked_until<now()) AND attempts<6 AND ($1::text IS NULL OR user_id=$1)
      ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 20) claim
    WHERE d.id=claim.id RETURNING d.*`, [userId]);
  let sent = 0;
  for (const delivery of rows) {
    const device = await pool.query('SELECT token FROM firebase_devices WHERE token_hash=$1 AND user_id=$2', [delivery.token_hash, delivery.user_id]);
    if (!device.rows[0]) continue;
    try {
      await send(privatePushPayload({ ...delivery, token: device.rows[0].token }, origin));
      await pool.query('UPDATE firebase_push_deliveries SET sent_at=now(),locked_until=NULL,last_error=NULL WHERE id=$1', [delivery.id]);
      sent++;
    } catch (error) {
      const code = String(error.code || 'delivery-failed').slice(0, 120);
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)) await pool.query('DELETE FROM firebase_devices WHERE token_hash=$1', [delivery.token_hash]);
      else await pool.query(`UPDATE firebase_push_deliveries SET locked_until=NULL,available_at=now()+interval '5 minutes',last_error=$2 WHERE id=$1`, [delivery.id, code]);
    }
  }
  return { enabled: true, claimed: rows.length, sent };
}
export async function flushPushSafely(userId) {
  let timer;
  try {
    const work = dispatchPush({ userId }).catch(() => console.warn('Firebase push remains queued for retry.'));
    await Promise.race([work, new Promise(resolve => { timer = setTimeout(resolve, 2500); })]);
  } finally { clearTimeout(timer); }
}
