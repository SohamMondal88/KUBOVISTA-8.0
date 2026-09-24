import { shouldApplyCapture } from '../../server/payment-state.js';
import { requireSession } from '../../server/auth.js';
import { query, transaction } from '../../server/db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../../server/http.js';
import { getRazorpay, verifyCheckoutSignature } from '../../server/razorpay.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const body = parseBody(req);
    const orderId = cleanText(body.razorpay_order_id, 100);
    const paymentId = cleanText(body.razorpay_payment_id, 100);
    const signature = cleanText(body.razorpay_signature, 256);
    if (!orderId || !paymentId || !signature || !verifyCheckoutSignature({ orderId, paymentId, signature })) return json(res, 400, { error: 'Payment verification failed.' });
    const local = await query(`SELECT p.*,b.destination_name FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.razorpay_order_id=$1 AND p.user_id=$2`, [orderId, session.user.id]);
    if (!local.rows[0]) return json(res, 404, { error: 'Payment record not found.' });
    const remote = await getRazorpay().payments.fetch(paymentId);
    if (remote.order_id !== orderId || Number(remote.amount) !== Number(local.rows[0].amount_paise) || remote.currency !== local.rows[0].currency || !['authorized','captured'].includes(remote.status)) return json(res, 400, { error: 'Payment details do not match the order.' });
    const state = remote.status === 'captured' ? 'captured' : 'authorized';
    const payment = await transaction(async client => {
      const locked = await client.query(`SELECT * FROM payments WHERE razorpay_order_id=$1 FOR UPDATE`, [orderId]);
      const previous = locked.rows[0];
      const updated = await client.query(`UPDATE payments SET razorpay_payment_id=$1,status=CASE WHEN status IN ('captured','refunded','refund_pending') THEN status ELSE $2 END,signature_verified=true,captured_at=CASE WHEN $2='captured' THEN COALESCE(captured_at,now()) ELSE captured_at END,updated_at=now() WHERE razorpay_order_id=$3 RETURNING *`, [paymentId, state, orderId]);
      if (shouldApplyCapture(previous.status, state)) {
        await client.query(`UPDATE bookings SET status=CASE WHEN $2='deposit' AND status='quotation_ready' THEN 'advance_paid' ELSE status END,booked_at=CASE WHEN $2='deposit' THEN COALESCE(booked_at,now()) ELSE booked_at END,balance_paid_at=CASE WHEN $2='balance' THEN COALESCE(balance_paid_at,now()) ELSE balance_paid_at END,updated_at=now() WHERE id=$1`, [updated.rows[0].booking_id,updated.rows[0].purpose]);
        await client.query(`INSERT INTO user_notifications (user_id,title,message,kind) VALUES ($1,'Trip payment received',$2,'payment')`, [session.user.id, `Your ${local.rows[0].destination_name} ${updated.rows[0].purpose} payment has been captured. We will share confirmation details after final checks.`]);
      }
      return updated.rows[0];
    });
    return json(res, 200, { payment, captured: payment.status === 'captured' });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
