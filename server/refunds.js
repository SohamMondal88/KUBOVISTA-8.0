import { getRazorpay } from './razorpay.js';

export async function issueRefund(paymentId, amountPaise, idempotencyKey) {
  const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json', 'X-Refund-Idempotency': idempotencyKey },
    body: JSON.stringify({ amount: amountPaise, speed: 'normal' }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Razorpay refund request returned ${response.status}`);
  const refund = await response.json();
  if (refund.payment_id !== paymentId || Number(refund.amount) !== amountPaise || !['pending','processed','failed'].includes(refund.status)) throw new Error('Refund response needs operator review.');
  return refund;
}
export async function remotePayment(paymentId) { return getRazorpay().payments.fetch(paymentId); }
