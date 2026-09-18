import { createHash } from 'node:crypto';
import { transaction } from '../../server/db.js';
import { json, methodNotAllowed, publicError, readRawBody } from '../../server/http.js';
import { getRazorpay, verifyWebhookSignature } from '../../server/razorpay.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const raw = await readRawBody(req);
    if (!verifyWebhookSignature(raw, req.headers['x-razorpay-signature'])) return json(res, 400, { error: 'Invalid webhook signature.' });
    const event = JSON.parse(raw.toString('utf8'));
    const eventId = String(req.headers['x-razorpay-event-id'] || event.id || createHash('sha256').update(raw).digest('hex'));
    await transaction(async client => {
      const stored = await client.query(`INSERT INTO payment_webhook_events (event_id,event_type,payload) VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`, [eventId, event.event, event]);
      if (!stored.rows[0]) return;
      const entity = event.payload?.payment?.entity || event.payload?.refund?.entity;
      if (!entity) return;
      if (event.event === 'payment.captured') {
        const updated = await client.query(`UPDATE payments SET razorpay_payment_id=$1,status='captured',captured_at=now(),updated_at=now() WHERE razorpay_order_id=$2 AND amount_paise=$3 AND currency=$4 AND status IN ('created','authorized','failed') RETURNING booking_id,user_id`, [entity.id, entity.order_id, entity.amount, entity.currency]);
        if (updated.rows[0]) await client.query(`UPDATE bookings SET status='advance_paid',updated_at=now() WHERE id=$1 AND status='quotation_ready'`, [updated.rows[0].booking_id]);
      } else if (event.event === 'payment.failed') {
        await client.query(`UPDATE payments SET razorpay_payment_id=$1,status='failed',failure_reason=$2,updated_at=now() WHERE razorpay_order_id=$3 AND status IN ('created','failed')`, [entity.id, entity.error_description || entity.error_reason || 'Payment failed', entity.order_id]);
      } else if (event.event === 'refund.processed') {
        const remote = await getRazorpay().payments.fetch(entity.payment_id);
        const status = Number(remote.amount_refunded) >= Number(remote.amount) ? 'refunded' : 'refund_pending';
        await client.query(`UPDATE payments SET status=$2,updated_at=now() WHERE razorpay_payment_id=$1`, [entity.payment_id, status]);
      } else if (event.event === 'refund.failed') {
        await client.query(`UPDATE payments SET status='refund_pending',failure_reason=$2,updated_at=now() WHERE razorpay_payment_id=$1`, [entity.payment_id, entity.error_description || 'Refund needs review']);
      }
    });
    return json(res, 200, { received: true });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
