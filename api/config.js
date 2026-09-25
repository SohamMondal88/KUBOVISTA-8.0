import services from '../server/services.js';
import { authConfigured } from '../server/auth.js';
import { databaseConfigured } from '../server/db.js';
import { paymentsConfigured } from '../server/razorpay.js';
import { json, methodNotAllowed } from '../server/http.js';

export default function handler(req, res) {
  if(req.query?.service)return services(req,res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  return json(res, 200, {
    auth: authConfigured(),
    database: databaseConfigured(),
    emailVerification: true,
    authProvider: 'firebase',
    google: process.env.FIREBASE_GOOGLE_ENABLED === 'true',
    payments: paymentsConfigured(),
    paymentProvider: 'Razorpay',
    currency: 'INR',
    advancePercent: 20
  });
}
