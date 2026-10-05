import { randomUUID } from "node:crypto";
import { isAdmin, requireSession } from "../../server/auth.js";
import { transaction } from "../../server/db.js";
import { json, methodNotAllowed, parseBody } from "../../server/http.js";
import {
  logEvent,
  requestId,
  safeErrorCode,
} from "../../server/observability.js";
import {
  issueRefund,
  listRemoteRefunds,
  matchRemoteRefund,
  remotePayment,
  remoteRefund,
} from "../../server/refunds.js";
import { syncRefund } from "../../server/refund-state.js";
import { reconcileBooking } from "../../server/reconcile.js";

async function reserveRefund(bookingId, actorId) {
  return transaction(async (client) => {
    const booking = (
      await client.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [
        bookingId,
      ])
    ).rows[0];
    if (!booking?.cancellation_requested_at || booking.status !== "cancelled")
      return null;
    const payment = (
      await client.query(
        "SELECT * FROM payments WHERE booking_id=$1 AND purpose='deposit' AND status IN ('captured','refund_pending') FOR UPDATE",
        [bookingId],
      )
    ).rows[0];
    if (
      !payment?.razorpay_payment_id ||
      !Number(booking.cancellation_refund_paise)
    )
      return null;
    if (
      Number(booking.cancellation_refund_paise) > Number(payment.amount_paise)
    )
      return null;
    const existing = (
      await client.query(
        `SELECT * FROM payment_refunds
         WHERE payment_id=$1 AND (
           status IN ('requested','pending','processed')
           OR submission_state IN ('submitting','ambiguous')
         ) ORDER BY created_at DESC LIMIT 1`,
        [payment.id],
      )
    ).rows[0];
    if (existing) return { refund: existing, payment };
    const refund = (
      await client.query(
        `INSERT INTO payment_refunds(
          payment_id,request_key,amount_paise,status,submission_state,requested_by
        ) VALUES($1,$2,$3,'requested','reserved',$4) RETURNING *`,
        [payment.id, randomUUID(), booking.cancellation_refund_paise, actorId],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details)
       VALUES($1,'refund.requested','payment',$2,$3)`,
      [
        actorId,
        payment.id,
        JSON.stringify({ amount_paise: refund.amount_paise }),
      ],
    );
    return { refund, payment };
  });
}

async function persistProviderRefund(entity, payment, actorId) {
  return transaction(async (client) =>
    syncRefund(client, entity, payment, actorId),
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!isAdmin(session))
    return json(res, 403, { error: "Administrator access is required." });
  const id = requestId(req);
  try {
    const { bookingId, action } = parseBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(bookingId || ""))
      return json(res, 400, {
        error: "Provide a valid booking.",
        requestId: id,
      });
    if (action === "reconcile") {
      const result = await reconcileBooking(bookingId, session.user.id);
      return result
        ? json(res, 200, { ...result, requestId: id })
        : json(res, 404, {
            error: "Booking not found.",
            requestId: id,
          });
    }

    // Always pull provider state before reserving or resubmitting a refund.
    await reconcileBooking(bookingId, session.user.id);
    const record = await reserveRefund(bookingId, session.user.id);
    if (!record)
      return json(res, 409, {
        error:
          "A cancelled booking with a captured refundable deposit is required.",
        requestId: id,
      });
    const { refund, payment } = record;
    if (refund.status === "processed")
      return json(res, 200, { refund, requestId: id });

    if (refund.razorpay_refund_id) {
      const entity = await remoteRefund(
        payment.razorpay_payment_id,
        refund.razorpay_refund_id,
      );
      return json(res, 200, {
        refund: await persistProviderRefund(entity, payment, session.user.id),
        requestId: id,
      });
    }

    const providerPayment = await remotePayment(payment.razorpay_payment_id);
    if (
      providerPayment.id !== payment.razorpay_payment_id ||
      providerPayment.status !== "captured"
    )
      return json(res, 409, {
        error: "The provider payment is not captured; no refund was submitted.",
        requestId: id,
      });

    const remoteMatch = matchRemoteRefund(
      await listRemoteRefunds(payment.razorpay_payment_id),
      {
        paymentId: payment.razorpay_payment_id,
        amountPaise: refund.amount_paise,
        attemptId: refund.request_key,
      },
    );
    if (remoteMatch)
      return json(res, 200, {
        refund: await persistProviderRefund(
          remoteMatch,
          payment,
          session.user.id,
        ),
        requestId: id,
      });

    if (["submitting", "ambiguous"].includes(refund.submission_state))
      return json(res, 409, {
        error:
          "The earlier refund result is unknown. Reconcile with Razorpay before any new submission.",
        requestId: id,
      });

    const claimed = await transaction(async (client) => {
      const result = await client.query(
        `UPDATE payment_refunds SET submission_state='submitting',
          attempt_count=attempt_count+1,updated_at=now()
         WHERE id=$1 AND status='requested' AND submission_state='reserved'
         RETURNING *`,
        [refund.id],
      );
      return result.rows[0] || null;
    });
    if (!claimed)
      return json(res, 409, {
        error: "Refund state changed. Reconcile before trying again.",
        requestId: id,
      });

    try {
      const issued = await issueRefund(
        payment.razorpay_payment_id,
        Number(claimed.amount_paise),
        claimed.request_key,
      );
      return json(res, 200, {
        refund: await persistProviderRefund(issued, payment, session.user.id),
        requestId: id,
      });
    } catch (error) {
      await transaction(async (client) => {
        await client.query(
          `UPDATE payment_refunds SET submission_state=$2,
            status=CASE WHEN $2='failed' THEN 'failed' ELSE status END,
            failure_reason=$3,updated_at=now()
           WHERE id=$1 AND submission_state='submitting'`,
          [
            claimed.id,
            error.ambiguous ? "ambiguous" : "failed",
            safeErrorCode(error),
          ],
        );
      });
      throw error;
    }
  } catch (error) {
    logEvent("error", "refund.review-required", {
      requestId: id,
      route: "admin-refund",
      code: safeErrorCode(error),
      status: error.ambiguous ? 503 : 502,
      provider: "razorpay",
    });
    return json(res, error.ambiguous ? 503 : 502, {
      error: error.ambiguous
        ? "Refund result is unknown. Reconcile before retrying; do not issue a separate refund."
        : "The provider rejected the refund. Review the attempt before trying again.",
      requestId: id,
    });
  }
}
