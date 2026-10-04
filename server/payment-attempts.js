import { randomUUID } from "node:crypto";
import { splitTotal, balanceEligible } from "./booking-policy.js";
import { transaction } from "./db.js";
import { logEvent } from "./observability.js";

const ATTEMPT_TTL_MINUTES = 20;
const ATTEMPT_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 3;

function response(status, error) {
  return { error, status };
}

export async function reservePaymentAttempt({
  bookingId,
  userId,
  purpose,
  acceptTerms,
  quoteUpdatedAt,
}) {
  return transaction(async (client) => {
    const locked = await client.query(
      "SELECT * FROM bookings WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [bookingId, userId],
    );
    const booking = locked.rows[0];
    if (!booking) return response(404, "Trip request not found.");
    if (booking.cancellation_requested_at || booking.status === "cancelled")
      return response(409, "This booking is cancelled.");
    if (purpose === "balance" && !balanceEligible(booking))
      return response(
        409,
        "The balance is payable only after operator-verified check-in.",
      );
    if (purpose === "balance") {
      const deposit = await client.query(
        "SELECT id FROM payments WHERE booking_id=$1 AND purpose='deposit' AND status='captured'",
        [booking.id],
      );
      if (!deposit.rowCount)
        return response(409, "A captured deposit is required.");
    }
    if (purpose === "deposit" && booking.status !== "quotation_ready")
      return response(409, "This quotation is not ready for payment.");
    if (
      !booking.quote_total_paise ||
      (purpose === "deposit" &&
        (!booking.quote_expires_at ||
          new Date(booking.quote_expires_at) <= new Date()))
    )
      return response(409, "This quotation has expired or is incomplete.");
    if (
      purpose === "deposit" &&
      booking.payment_policy_version === 2 &&
      (!booking.checkin_at || new Date(booking.checkin_at) <= new Date())
    )
      return response(
        409,
        "The scheduled check-in has passed. Request an updated quotation.",
      );
    if (acceptTerms !== true)
      return response(
        400,
        "Accept the displayed quotation and cancellation terms.",
      );
    if (
      purpose === "deposit" &&
      booking.payment_policy_version === 2 &&
      new Date(quoteUpdatedAt).getTime() !==
        new Date(booking.updated_at).getTime()
    )
      return response(
        409,
        "The quotation changed. Reload checkout and review the latest terms.",
      );

    const quote = (
      await client.query(
        "SELECT * FROM booking_quotes WHERE booking_id=$1 AND version=$2 FOR UPDATE",
        [booking.id, booking.current_quote_version],
      )
    ).rows[0];
    if (!quote)
      return response(
        409,
        "This quotation needs to be reissued before online payment.",
      );
    if (
      Number(quote.total_paise) !== Number(booking.quote_total_paise) ||
      new Date(quote.expires_at).getTime() !==
        new Date(booking.quote_expires_at).getTime()
    )
      return response(409, "Quotation details changed. Contact support.");

    const split = splitTotal(booking.quote_total_paise);
    const amount =
      booking.payment_policy_version === 2
        ? split[purpose]
        : Math.round(
            (Number(booking.quote_total_paise) *
              Number(booking.advance_percent)) /
              100,
          );
    if (!Number.isSafeInteger(amount) || amount < 100)
      return response(
        400,
        "The payable amount must be at least 100 paise. Request an updated quotation.",
      );

    const completed = await client.query(
      `SELECT id FROM payments WHERE booking_id=$1 AND purpose=$2
       AND status IN ('captured','refunded','refund_pending') LIMIT 1`,
      [booking.id, purpose],
    );
    if (completed.rowCount)
      return response(
        409,
        "This payment has already been recorded. Review payment history.",
      );

    await client.query(
      `INSERT INTO quote_acceptances (quote_id,booking_id,user_id,purpose)
       VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [quote.id, booking.id, userId, purpose],
    );

    const reusable = (
      await client.query(
        `SELECT * FROM payment_attempts WHERE booking_id=$1 AND purpose=$2 AND quote_id=$3
         AND status IN ('reserved','creating','created','attempted','failed','ambiguous')
         ORDER BY attempt_no DESC LIMIT 1`,
        [booking.id, purpose, quote.id],
      )
    ).rows[0];
    if (reusable) return { attempt: reusable, booking, amount };

    const recent = await client.query(
      `SELECT count(*)::int AS count FROM payment_attempts
       WHERE user_id=$1 AND created_at>now()-($2::text || ' minutes')::interval`,
      [userId, ATTEMPT_WINDOW_MINUTES],
    );
    if (Number(recent.rows[0].count) >= MAX_ATTEMPTS_PER_WINDOW)
      return response(
        429,
        "Too many payment attempts. Wait 15 minutes before trying again.",
      );

    const next = await client.query(
      "SELECT COALESCE(max(attempt_no),0)+1 AS value FROM payment_attempts WHERE booking_id=$1 AND purpose=$2",
      [booking.id, purpose],
    );
    const attemptNo = Number(next.rows[0].value);
    if (attemptNo > 20)
      return response(
        409,
        "This booking has reached its payment-attempt limit. Contact support.",
      );
    const receipt = `kubo_${booking.id.replaceAll("-", "").slice(0, 12)}_${purpose[0]}_${attemptNo}_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const attempt = (
      await client.query(
        `INSERT INTO payment_attempts
          (booking_id,user_id,quote_id,purpose,attempt_no,receipt,amount_paise,currency,status,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'INR','reserved',now()+($8::text || ' minutes')::interval)
         RETURNING *`,
        [
          booking.id,
          userId,
          quote.id,
          purpose,
          attemptNo,
          receipt,
          amount,
          ATTEMPT_TTL_MINUTES,
        ],
      )
    ).rows[0];
    await client.query(
      "UPDATE bookings SET terms_accepted_at=COALESCE(terms_accepted_at,now()) WHERE id=$1",
      [booking.id],
    );
    return { attempt, booking, amount };
  });
}

async function findOrderByReceipt(provider, attempt) {
  const page = await provider.orders.all({
    receipt: attempt.receipt,
    count: 10,
  });
  const matches = (page.items || []).filter(
    (order) =>
      order.receipt === attempt.receipt &&
      Number(order.amount) === Number(attempt.amount_paise) &&
      order.currency === attempt.currency,
  );
  if (matches.length > 1)
    throw Object.assign(new Error("Duplicate provider orders for receipt."), {
      code: "PAYMENT_DUPLICATE_RECEIPT",
    });
  return matches[0] || null;
}

async function persistOrder(attempt, order) {
  if (
    !order?.id ||
    Number(order.amount) !== Number(attempt.amount_paise) ||
    order.currency !== attempt.currency ||
    order.receipt !== attempt.receipt
  )
    throw Object.assign(new Error("Provider order does not match attempt."), {
      code: "PAYMENT_ORDER_MISMATCH",
    });
  return transaction(async (client) => {
    const current = (
      await client.query(
        "SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE",
        [attempt.id],
      )
    ).rows[0];
    if (!current) throw new Error("Payment attempt disappeared.");
    if (current.provider_order_id && current.provider_order_id !== order.id)
      throw Object.assign(new Error("Conflicting provider order."), {
        code: "PAYMENT_ORDER_CONFLICT",
      });
    const status = order.status === "attempted" ? "attempted" : "created";
    await client.query(
      `UPDATE payment_attempts SET provider_order_id=$2,status=$3,provider_status=$4,
       last_checked_at=now(),updated_at=now() WHERE id=$1`,
      [current.id, order.id, status, order.status],
    );
    const payment = (
      await client.query(
        `INSERT INTO payments
          (booking_id,user_id,razorpay_order_id,amount_paise,currency,status,purpose,quote_id,payment_attempt_id)
         VALUES($1,$2,$3,$4,$5,'created',$6,$7,$8)
         ON CONFLICT(razorpay_order_id) DO UPDATE SET updated_at=now()
         RETURNING id,razorpay_order_id,amount_paise,currency,status,purpose`,
        [
          current.booking_id,
          current.user_id,
          order.id,
          current.amount_paise,
          current.currency,
          current.purpose,
          current.quote_id,
          current.id,
        ],
      )
    ).rows[0];
    return {
      payment,
      attempt: { ...current, provider_order_id: order.id, status },
    };
  });
}

export async function resolvePaymentAttempt(attempt, provider) {
  let order = null;
  if (attempt.provider_order_id) {
    order = await provider.orders.fetch(attempt.provider_order_id);
    const remotePayments = await provider.orders.fetchPayments(
      attempt.provider_order_id,
    );
    const successful = (remotePayments.items || []).find((payment) =>
      ["authorized", "captured"].includes(payment.status),
    );
    if (successful || order.status === "paid") {
      await transaction((client) =>
        client.query(
          `UPDATE payment_attempts SET status=$2,provider_status=$3,last_checked_at=now(),updated_at=now()
           WHERE id=$1`,
          [attempt.id, successful?.status || "captured", order.status],
        ),
      );
      return response(
        409,
        "This payment already reached the provider. Review payment history or retry verification.",
      );
    }
    const definitivelyFailed =
      attempt.status === "failed" &&
      (remotePayments.items || []).length > 0 &&
      (remotePayments.items || []).every(
        (payment) => payment.status === "failed",
      );
    const expired = new Date(attempt.expires_at) <= new Date();
    if (definitivelyFailed || expired) {
      await transaction((client) =>
        client.query(
          `UPDATE payment_attempts SET status=$2,provider_status=$3,last_checked_at=now(),updated_at=now()
           WHERE id=$1`,
          [attempt.id, expired ? "expired" : "superseded", order.status],
        ),
      );
      return { replace: true };
    }
    return persistOrder(attempt, order);
  }

  try {
    order = await findOrderByReceipt(provider, attempt);
    if (!order) {
      const claimed = await transaction((client) =>
        client.query(
          `UPDATE payment_attempts SET status='creating',updated_at=now()
         WHERE id=$1 AND (status IN ('reserved','ambiguous') OR (status='creating' AND updated_at<now()-interval '2 minutes'))
         RETURNING id`,
          [attempt.id],
        ),
      );
      if (!claimed.rowCount)
        return response(
          409,
          "A payment order is already being prepared. Wait a moment and retry.",
        );
      order = await provider.orders.create({
        amount: Number(attempt.amount_paise),
        currency: attempt.currency,
        receipt: attempt.receipt,
        notes: {
          booking_id: attempt.booking_id,
          purpose: attempt.purpose,
          attempt_id: attempt.id,
        },
      });
    }
    return persistOrder(attempt, order);
  } catch (error) {
    try {
      order = await findOrderByReceipt(provider, attempt);
      if (order) return persistOrder(attempt, order);
    } catch (recoveryError) {
      logEvent("error", "payment.order.recovery_failed", {
        code: recoveryError?.code || "provider-lookup",
        provider: "razorpay",
      });
    }
    await transaction((client) =>
      client.query(
        `UPDATE payment_attempts SET status='ambiguous',failure_code=$2,updated_at=now()
         WHERE id=$1 AND provider_order_id IS NULL`,
        [attempt.id, String(error?.code || "provider-error").slice(0, 80)],
      ),
    );
    throw error;
  }
}
