import { isAdmin, requireSession } from '../../server/auth.js';
import { query, transaction } from '../../server/db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../../server/http.js';

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return methodNotAllowed(res, ['GET','POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!isAdmin(session)) return json(res, 403, { error: 'Administrator access is required.' });
  try {
    if (req.method === 'GET') return json(res,200,{bookings:(await query('SELECT b.*,u.email,u.name FROM bookings b JOIN \"user\" u ON u.id=b.user_id ORDER BY b.created_at DESC LIMIT 100')).rows});
    const body = parseBody(req);
    const total = Math.round(Number(body.totalAmount) * 100);
    const advancePercent = Math.round(Number(body.advancePercent || process.env.DEFAULT_ADVANCE_PERCENT || 25));
    if (String(body.notes||'').trim().length<30) return json(res,400,{error:'Include the seller, scope, inclusions, exclusions and cancellation terms in the quotation.'});
    if (!body.bookingId || !Number.isSafeInteger(total) || !Number.isSafeInteger(advancePercent) || total > 1000000000 || total < 100 || advancePercent < 1 || advancePercent > 100) return json(res, 400, { error: 'Provide a valid booking, quotation amount and advance percentage.' });
    const expiry = new Date(body.expiresAt);
    if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) return json(res, 400, { error: 'Provide a future quotation expiry.' });
    const booking = await transaction(async client => {
      const updated = await client.query(`UPDATE bookings SET quote_total_paise=$1,advance_percent=$2,quote_notes=$3,quote_expires_at=$4,status='quotation_ready',updated_at=now() WHERE id=$5 AND status IN ('consultation_requested','consultation_scheduled','quotation_ready') AND NOT EXISTS (SELECT 1 FROM payments WHERE booking_id=bookings.id) RETURNING *`, [total, advancePercent, cleanText(body.notes, 1200), expiry.toISOString(), body.bookingId]);
      if (!updated.rows[0]) return null;
      await client.query(`INSERT INTO user_notifications (user_id,title,message,kind) VALUES ($1,'Your quotation is ready',$2,'payment')`, [updated.rows[0].user_id, `Review the ${updated.rows[0].destination_name} quotation and pay the ${advancePercent}% advance before it expires.`]);
      return updated.rows[0];
    });
    if (!booking) return json(res, 404, { error: 'Trip request not found.' });
    return json(res, 200, { booking });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
