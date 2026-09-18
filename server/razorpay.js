import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';

let instance;

export function paymentsConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
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
