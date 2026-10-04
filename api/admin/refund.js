import { randomUUID } from 'node:crypto';
import { isAdmin, requireSession } from '../../server/auth.js';
import { transaction } from '../../server/db.js';
import { json, methodNotAllowed, parseBody } from '../../server/http.js';
import { issueRefund, remotePayment } from '../../server/refunds.js';
import { syncRefund } from '../../server/refund-state.js';
import { reconcileBooking } from '../../server/reconcile.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!isAdmin(session)) return json(res, 403, { error: 'Administrator access is required.' });
  try {
    const { bookingId, action } = parseBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(bookingId || '')) return json(res, 400, { error: 'Provide a valid booking.' });
    if (action === 'reconcile') { const result = await reconcileBooking(bookingId, session.user.id); return result ? json(res, 200, result) : json(res, 404, { error: 'Booking not found.' }); }
    const record = await transaction(async client => {
      const booking = (await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
      if (!booking?.cancellation_requested_at || booking.status !== 'cancelled') return null;
      const payment = (await client.query("SELECT * FROM payments WHERE booking_id=$1 AND purpose='deposit' AND status IN ('captured','refund_pending') FOR UPDATE", [bookingId])).rows[0];
      if (!payment?.razorpay_payment_id || !Number(booking.cancellation_refund_paise)) return null;
      if (Number(booking.cancellation_refund_paise) > Number(payment.amount_paise)) return null;
      const existing = (await client.query('SELECT * FROM payment_refunds WHERE payment_id=$1 ORDER BY created_at DESC LIMIT 1', [payment.id])).rows[0];
      if (existing) return { refund: existing, payment };
      const refund = (await client.query(`INSERT INTO payment_refunds(payment_id,request_key,amount_paise,status,requested_by)
        VALUES($1,$2,$3,'requested',$4) RETURNING *`, [payment.id, randomUUID(), booking.cancellation_refund_paise, session.user.id])).rows[0];
      await client.query(`INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'refund.requested','payment',$2,$3)`, [session.user.id, payment.id, JSON.stringify({ amount_paise: refund.amount_paise })]);
      return { refund, payment };
    });
    if (!record) return json(res, 409, { error: 'A cancelled booking with a captured refundable deposit is required.' });
    const { refund, payment } = record;
    if (refund.status === 'processed') return json(res, 200, { refund });
    if (refund.razorpay_refund_id) {
      const remote = await remotePayment(payment.razorpay_payment_id);
      if (remote.id !== payment.razorpay_payment_id) return json(res, 409, { error: 'Provider payment mismatch.' });
      return json(res, 200, { refund, providerAmountRefunded: remote.amount_refunded });
    }
    // The persisted key makes an ambiguous network retry safe at the provider.
    const issued = await issueRefund(payment.razorpay_payment_id, Number(refund.amount_paise), refund.request_key);
    const updated = await transaction(client => syncRefund(client, issued, payment, session.user.id));
    return json(res, 200, { refund: updated });
  } catch (error) {
    console.error('Refund request requires reconciliation', error);
    return json(res, 503, { error: 'Refund state needs review. Retry with the same booking; do not issue a separate refund.' });
  }
}
