import {splitTotal,balanceEligible} from '../../server/booking-policy.js';
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
    const body=parseBody(req);const {bookingId}=body;const purpose=body.purpose==='balance'?'balance':'deposit';
    const payload = await transaction(async client => {
      const locked = await client.query(`SELECT * FROM bookings WHERE id=$1 AND user_id=$2 FOR UPDATE`, [bookingId, session.user.id]);
      const booking = locked.rows[0];
      if (!booking) return { status: 404, error: 'Trip request not found.' };
      if(booking.cancellation_requested_at||booking.status==='cancelled')return {status:409,error:'This booking is cancelled.'};
      if(purpose==='balance'&&!balanceEligible(booking))return {status:409,error:'The balance is payable only after operator-verified check-in.'};
      if(purpose==='balance'){const deposit=await client.query("SELECT id FROM payments WHERE booking_id=$1 AND purpose='deposit' AND status='captured'",[booking.id]);if(!deposit.rowCount)return {status:409,error:'A captured deposit is required.'};}
      if (purpose==='deposit' && booking.status !== 'quotation_ready') return { status: 409, error: 'This quotation is not ready for payment.' };
      if (!booking.quote_total_paise || (purpose==='deposit'&&(!booking.quote_expires_at||new Date(booking.quote_expires_at)<=new Date()))) return { status: 409, error: 'This quotation has expired or is incomplete.' };
      if(purpose==='deposit'&&booking.payment_policy_version===2&&(!booking.checkin_at||new Date(booking.checkin_at)<=new Date()))return {status:409,error:'The scheduled check-in has passed. Request an updated quotation.'};
      if(body.acceptTerms!==true)return {status:400,error:'Accept the displayed quotation and cancellation terms.'};
      if(purpose==='deposit'&&booking.payment_policy_version===2&&new Date(body.quoteUpdatedAt).getTime()!==new Date(booking.updated_at).getTime())return {status:409,error:'The quotation changed. Reload checkout and review the latest terms.'};
      const quoteResult=await client.query('SELECT * FROM booking_quotes WHERE booking_id=$1 AND version=$2 FOR UPDATE',[booking.id,booking.current_quote_version]);
      const quote=quoteResult.rows[0];
      if(!quote)return {status:409,error:'This quotation needs to be reissued before online payment.'};
      if(Number(quote.total_paise)!==Number(booking.quote_total_paise)||new Date(quote.expires_at).getTime()!==new Date(booking.quote_expires_at).getTime())return {status:409,error:'Quotation details changed. Contact support.'};
      const split=splitTotal(booking.quote_total_paise);
      const amount = booking.payment_policy_version===2?split[purpose]:Math.round(Number(booking.quote_total_paise)*Number(booking.advance_percent)/100);
      const previous = await client.query(`SELECT * FROM payments WHERE booking_id=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1`, [booking.id,purpose]);
      if (previous.rows[0] && previous.rows[0].quote_id!==quote.id)return {status:409,error:'A previous quotation has a payment record. Contact support.'};
      if (previous.rows[0] && previous.rows[0].status==='failed')return {status:409,error:'A failed attempt needs provider reconciliation before retry. Contact support.'};
      if (previous.rows[0] && ['captured','refunded','refund_pending'].includes(previous.rows[0].status))return {status:409,error:'This payment has already been recorded. Review payment history.'};
      await client.query(`INSERT INTO quote_acceptances (quote_id,booking_id,user_id,purpose) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[quote.id,booking.id,session.user.id,purpose]);
      if (previous.rows[0]) return { payment: previous.rows[0], booking, keyId: process.env.RAZORPAY_KEY_ID };
      const order = await getRazorpay().orders.create({
        amount,
        currency: 'INR',
        receipt: `kubo_${booking.id.slice(0, 8)}_${Date.now().toString(36)}`,
        notes: { booking_id: booking.id, user_id: session.user.id, destination: booking.destination_name, purpose }
      });
      const inserted = await client.query(`INSERT INTO payments (booking_id,user_id,razorpay_order_id,amount_paise,currency,status,purpose,quote_id) VALUES ($1,$2,$3,$4,$5,'created',$6,$7) RETURNING *`, [booking.id, session.user.id, order.id, amount, order.currency,purpose,quote.id]);
      await client.query('UPDATE bookings SET terms_accepted_at=COALESCE(terms_accepted_at,now()) WHERE id=$1',[booking.id]);
      return { payment: inserted.rows[0], booking, keyId: process.env.RAZORPAY_KEY_ID };
    });
    if (payload.error) return json(res, payload.status, { error: payload.error });
    return json(res, 200, {
      keyId: payload.keyId,
      purpose,
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
