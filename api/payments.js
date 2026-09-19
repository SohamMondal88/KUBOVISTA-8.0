import { requireSession } from '../server/auth.js';
import { query } from '../server/db.js';
import { json, methodNotAllowed, publicError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const result = await query(`SELECT p.id,p.booking_id,p.purpose,p.razorpay_order_id,p.razorpay_payment_id,p.amount_paise,p.currency,p.status,p.signature_verified,p.created_at,p.updated_at,b.destination_name
      FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [session.user.id]);
    return json(res, 200, { payments: result.rows });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
