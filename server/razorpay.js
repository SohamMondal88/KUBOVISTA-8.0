import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';

let instance;

export function paymentsConfigured() {
  return process.env.PAYMENTS_ENABLED === 'true' && process.env.BUSINESS_DETAILS_VERIFIED === 'true' && process.env.LEGAL_TAX_APPROVED === 'true'
    && Boolean(process.env.DATABASE_URL && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET
      && process.env.PUBLIC_LEGAL_NAME && process.env.PUBLIC_BUSINESS_ADDRESS && process.env.PUBLIC_CONTACT_EMAIL
      && process.env.PUBLIC_GRIEVANCE_EMAIL && process.env.PUBLIC_TAX_DISCLOSURE);
}

export function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error('Razorpay is not configured.');
  if (!instance) instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  return instance;
}

function safeEqual(expected, actual) {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(String(actual || ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!process.env.RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
