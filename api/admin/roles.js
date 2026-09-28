import { isAdmin, requireSession } from '../../server/auth.js';
import { transaction } from '../../server/db.js';
import { json, methodNotAllowed, parseBody, publicError } from '../../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!isAdmin(session)) return json(res, 403, { error: 'Administrator access is required.' });
  if (!session.authTime || Date.now()/1000-session.authTime>300) return json(res, 401, { error: 'Sign in again before changing access.' });
  const { userId, role } = parseBody(req);
  if (typeof userId !== 'string' || userId.length > 128 || !['traveler','support','operator','admin'].includes(role) || userId === session.user.id) return json(res, 400, { error: 'Choose another account and a valid role.' });
  try {
    const result = await transaction(async client => {
      const prior = (await client.query('SELECT id,role FROM "user" WHERE id=$1 AND disabled_at IS NULL FOR UPDATE', [userId])).rows[0];
      if (!prior) return null;
      if (prior.role === role) return { id: prior.id, role };
      await client.query('UPDATE "user" SET role=$2,"updatedAt"=now() WHERE id=$1', [userId, role]);
      await client.query(`INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'role.changed','user',$2,$3)`, [session.user.id, userId, JSON.stringify({ from: prior.role, to: role })]);
      return { id: userId, role };
    });
    return result ? json(res, 200, { user: result }) : json(res, 404, { error: 'Account not found.' });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
