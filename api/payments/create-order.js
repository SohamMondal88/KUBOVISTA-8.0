import { requireSession } from '../../server/auth.js';
import { transaction } from '../../server/db.js';
import { json, methodNotAllowed, parseBody, publicError } from '../../server/http.js';
import { getRazorpay, paymentsConfigured } from '../../server/razorpay.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!paymentsConfigured()) return json(res, 503, { error: 'Online payments are not configured yet.' });
  try {
    const { bookingId } = parseBody(req);
    const payload = await transaction(async client => {
      const locked = await client.query(`SELECT * FROM bookings WHERE id=$1 AND user_id=$2 FOR UPDATE`, [bookingId, session.user.id]);
      const booking = locked.rows[0];
      if (!booking) return { status: 404, error: 'Trip request not found.' };
      if (booking.status !== 'quotation_ready') return { status: 409, error: 'This quotation is not ready for payment.' };
      if (!booking.quote_total_paise || !booking.quote_expires_at || new Date(booking.quote_expires_at) <= new Date()) return { status: 409, error: 'This quotation has expired or is incomplete.' };
      const amount = Math.round(Number(booking.quote_total_paise) * Number(booking.advance_percent) / 100);
      const previous = await client.query(`SELECT * FROM payments WHERE booking_id=$1 AND status IN ('created','authorized','captured','failed','refund_pending','refunded') ORDER BY created_at DESC LIMIT 1`, [booking.id]);
      if (previous.rows[0]) return { payment: previous.rows[0], booking, keyId: process.env.RAZORPAY_KEY_ID };
      const order = await getRazorpay().orders.create({
        amount,
        currency: 'INR',
        receipt: `kubo_${booking.id.slice(0, 8)}_${Date.now().toString(36)}`,
        notes: { booking_id: booking.id, user_id: session.user.id, destination: booking.destination_name }
      });
      const inserted = await client.query(`INSERT INTO payments (booking_id,user_id,razorpay_order_id,amount_paise,currency,status) VALUES ($1,$2,$3,$4,$5,'created') RETURNING *`, [booking.id, session.user.id, order.id, amount, order.currency]);
      return { payment: inserted.rows[0], booking, keyId: process.env.RAZORPAY_KEY_ID };
    });
    if (payload.error) return json(res, payload.status, { error: payload.error });
    return json(res, 200, {
      keyId: payload.keyId,
      orderId: payload.payment.razorpay_order_id,
      amount: Number(payload.payment.amount_paise),
      currency: payload.payment.currency,
      booking: { id: payload.booking.id, destination: payload.booking.destination_name },
      customer: { name: session.user.name, email: session.user.email }
    });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
