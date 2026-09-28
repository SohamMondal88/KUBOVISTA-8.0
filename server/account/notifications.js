import { validPushToken, tokenHash, dispatchPush, dispatcherAuthorized } from '../firebase-push.js';
import { requireSession } from '../auth.js';
import { query } from '../db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if (req.query?.dispatch === '1') {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    if (!dispatcherAuthorized(req.headers.authorization)) return json(res, 401, { error: 'Unauthorized dispatcher.' });
    try { return json(res, 200, await dispatchPush()); } catch { return json(res, 503, { error: 'Notification dispatch unavailable.' }); }
  }
  if (!['GET', 'PATCH', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PATCH', 'POST', 'DELETE']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'POST') {
      if (process.env.FIREBASE_PUSH_ENABLED !== 'true') return json(res, 503, { error: 'Booking push notifications are not enabled yet.' });
      const token = parseBody(req).token;
      if (!validPushToken(token)) return json(res, 400, { error: 'Invalid notification device token.' });
      await query(`INSERT INTO firebase_devices (token_hash,token,user_id) VALUES ($1,$2,$3)
        ON CONFLICT (token_hash) DO UPDATE SET token=EXCLUDED.token,user_id=EXCLUDED.user_id,updated_at=now()`, [tokenHash(token), token, session.user.id]);
      return json(res, 200, { success: true });
    }
    if (req.method === 'DELETE') {
      const body = parseBody(req);
      if (body.all === true) await query('DELETE FROM firebase_devices WHERE user_id=$1', [session.user.id]);
      else if (validPushToken(body.token)) await query('DELETE FROM firebase_devices WHERE user_id=$1 AND token_hash=$2', [session.user.id, tokenHash(body.token)]);
      else return json(res, 400, { error: 'Choose a notification device to remove.' });
      return json(res, 200, { success: true });
    }
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [session.user.id]);
      return json(res, 200, { notifications: rows });
    }
    const id = cleanText(parseBody(req).id, 80);
    if (id) await query('UPDATE user_notifications SET read_at=COALESCE(read_at,now()) WHERE id::text=$1 AND user_id=$2', [id, session.user.id]);
    else await query('UPDATE user_notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [session.user.id]);
    return json(res, 200, { success: true });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
