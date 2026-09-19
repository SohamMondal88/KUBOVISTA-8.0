import services from '../server/services.js';
import { authConfigured } from '../server/auth.js';
import { databaseConfigured } from '../server/db.js';
import { emailConfigured } from '../server/email.js';
import { paymentsConfigured } from '../server/razorpay.js';
import { json, methodNotAllowed } from '../server/http.js';

export default function handler(req, res) {
  if(req.query?.service)return services(req,res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  return json(res, 200, {
    auth: authConfigured(),
    database: databaseConfigured(),
    emailVerification: emailConfigured(),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    payments: paymentsConfigured(),
    paymentProvider: 'Razorpay',
    currency: 'INR',
    advancePercent: Number(process.env.DEFAULT_ADVANCE_PERCENT || 25)
  });
}
