import { requireSession } from "../../server/auth.js";
import {
  json,
  methodNotAllowed,
  parseBody,
  publicError,
} from "../../server/http.js";
import { getRazorpay, paymentsConfigured } from "../../server/razorpay.js";
import {
  reservePaymentAttempt,
  resolvePaymentAttempt,
} from "../../server/payment-attempts.js";
import { consumeRateLimit, requestSubject } from "../../server/rate-limit.js";
import { logEvent, requestId } from "../../server/observability.js";

export default async function handler(req, res) {
  const started = Date.now();
  const id = requestId(req);
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!paymentsConfigured())
    return json(res, 503, { error: "Online payments are not configured yet." });
  try {
    const allowance = await consumeRateLimit({
      bucket: "payment-order",
      subject: requestSubject(req, session.user.id),
      limit: 6,
      windowSeconds: 900,
    });
    if (!allowance.allowed)
      return json(res, allowance.unavailable ? 503 : 429, {
        error: allowance.unavailable
          ? "Payment protection is temporarily unavailable. Please retry shortly."
          : "Too many payment attempts. Wait 15 minutes before trying again.",
      });
    const body = parseBody(req);
    const { bookingId } = body;
    const purpose = body.purpose === "balance" ? "balance" : "deposit";
    let payload = await reservePaymentAttempt({
      bookingId,
      userId: session.user.id,
      purpose,
      acceptTerms: body.acceptTerms,
      quoteUpdatedAt: body.quoteUpdatedAt,
    });
    if (payload.error)
      return json(res, payload.status, { error: payload.error });
    let resolved = await resolvePaymentAttempt(payload.attempt, getRazorpay());
    if (resolved.replace) {
      payload = await reservePaymentAttempt({
        bookingId,
        userId: session.user.id,
        purpose,
        acceptTerms: body.acceptTerms,
        quoteUpdatedAt: body.quoteUpdatedAt,
      });
      if (payload.error)
        return json(res, payload.status, { error: payload.error });
      resolved = await resolvePaymentAttempt(payload.attempt, getRazorpay());
    }
    if (resolved.error)
      return json(res, resolved.status, { error: resolved.error });
    logEvent("info", "payment.order.ready", {
      requestId: id,
      route: "payments.create-order",
      status: 200,
      durationMs: Date.now() - started,
      provider: "razorpay",
    });
    return json(res, 200, {
      requestId: id,
      keyId: process.env.RAZORPAY_KEY_ID,
      purpose,
      orderId: resolved.payment.razorpay_order_id,
      amount: Number(resolved.payment.amount_paise),
      currency: resolved.payment.currency,
      attempt: {
        number: Number(payload.attempt.attempt_no),
        expiresAt: payload.attempt.expires_at,
      },
      booking: {
        id: payload.booking.id,
        destination: payload.booking.destination_name,
      },
      customer: { name: session.user.name, email: session.user.email },
    });
  } catch (error) {
    const failure = publicError(error, { req, route: "payments.create-order" });
    return json(res, failure.status, {
      error: failure.message,
      requestId: failure.requestId,
    });
  }
}
