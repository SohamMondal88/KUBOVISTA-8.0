import { requireSession } from '../server/auth.js';
import { query } from '../server/db.js';
import { json, methodNotAllowed, publicError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const { rows } = await query(`SELECT p.*, b.destination_name,
      COALESCE((SELECT sum(r.amount_paise) FROM payment_refunds r WHERE r.payment_id=p.id AND r.status='processed'),0) AS refunded_amount_paise
      FROM payments p JOIN bookings b ON b.id=p.booking_id
      WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [session.user.id]);
    return json(res, 200, { payments: rows });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
