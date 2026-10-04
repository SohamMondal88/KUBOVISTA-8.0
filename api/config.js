import services from "../server/services.js";
import { authConfigured } from "../server/auth.js";
import { databaseConfigured } from "../server/db.js";
import { paymentReadiness } from "../server/razorpay.js";
import { json, methodNotAllowed } from "../server/http.js";

export default function handler(req, res) {
  if (req.query?.service) return services(req, res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const payment = paymentReadiness();
  const auth = authConfigured();
  const database = databaseConfigured();
  return json(res, 200, {
    status: "configuration",
    configured: { auth, database, payments: payment.enabled },
    // Compatibility fields. These describe configuration, not runtime health.
    auth,
    database,
    emailVerification: true,
    authProvider: "firebase",
    google: auth && process.env.FIREBASE_GOOGLE_ENABLED === "true",
    payments: payment.enabled,
    paymentMode: payment.mode,
    paymentProvider: "Razorpay",
    currency: "INR",
    advancePercent: 20,
  });
}
