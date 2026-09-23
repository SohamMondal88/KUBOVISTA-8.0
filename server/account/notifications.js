import { requireSession } from '../auth.js';
import { query } from '../db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PATCH']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const result = await query('SELECT id,title,message,kind,read_at,created_at FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [session.user.id]);
      return json(res, 200, { notifications: result.rows });
    }
    const id = cleanText(parseBody(req).id, 80);
    if (id) await query('UPDATE user_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2', [id, session.user.id]);
    else await query('UPDATE user_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1', [session.user.id]);
    return json(res, 200, { success: true });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
