import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';

let instance;

export function paymentReadiness(env = process.env) {
  const key = String(env.RAZORPAY_KEY_ID || '');
  const test = key.startsWith('rzp_test_');
  const live = key.startsWith('rzp_live_');
  const common = Boolean(env.DATABASE_URL && key && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
  const previewTest = test && env.PAYMENTS_TEST_MODE === 'true' && env.VERCEL_ENV !== 'production'
    && (Boolean(env.VERCEL_ENV) || env.NODE_ENV !== 'production');
  const approvedLive = live && env.BUSINESS_DETAILS_VERIFIED === 'true' && env.LEGAL_TAX_APPROVED === 'true'
    && Boolean(env.PUBLIC_LEGAL_NAME && env.PUBLIC_BUSINESS_ADDRESS && env.PUBLIC_CONTACT_EMAIL
      && env.PUBLIC_GRIEVANCE_EMAIL && env.PUBLIC_TAX_DISCLOSURE);
  const enabled = env.PAYMENTS_ENABLED === 'true' && common && (previewTest || approvedLive);
  return { enabled, mode: previewTest ? 'test' : approvedLive ? 'live' : 'unavailable' };
}

export function paymentsConfigured() {
  return paymentReadiness().enabled;
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
