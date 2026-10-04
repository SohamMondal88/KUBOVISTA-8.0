import services from '../server/services.js';
import { authConfigured } from '../server/auth.js';
import { firestoreConfigured } from '../server/firestore.js';
import { databaseConfigured } from '../server/db.js';
import { paymentReadiness } from '../server/razorpay.js';
import { json, methodNotAllowed } from '../server/http.js';

export default function handler(req, res) {
  if(req.query?.service)return services(req,res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const payment = paymentReadiness();
  return json(res, 200, {
    auth: authConfigured(),
    database: databaseConfigured(),
    emailVerification: true,
    authProvider: 'firebase',
    google: authConfigured() && process.env.FIREBASE_GOOGLE_ENABLED === 'true',
    payments: payment.enabled,
    paymentMode: payment.mode,
    paymentProvider: 'Razorpay',
    currency: 'INR',
    advancePercent: 20
  });
}
