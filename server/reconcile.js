import { getRazorpay } from "./razorpay.js";
import { transaction } from "./db.js";
import { syncRefund } from "./refund-state.js";
import { enqueueEmail, flushEmailSafely } from "./transactional-email.js";

export async function reconcileBooking(bookingId, actorId) {
  const local = await transaction(async (client) => {
    const booking = (
      await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE", [
        bookingId,
      ])
    ).rows[0];
    if (!booking) return null;
    return (
      await client.query(
        "SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at",
        [bookingId],
      )
    ).rows;
  });
  if (!local) return null;
  const provider = getRazorpay();
  for (const payment of local) {
    // An order without a payment ID can still contain a successful payment if
    // the browser callback and webhook both failed to arrive.
    const remoteOrder = await provider.orders.fetch(payment.razorpay_order_id);
    if (
      Number(remoteOrder.amount) !== Number(payment.amount_paise) ||
      remoteOrder.currency !== payment.currency
    )
      throw new Error("Order amount mismatch.");
    const remotePayments = await provider.orders.fetchPayments(
      payment.razorpay_order_id,
    );
    const matches = (remotePayments.items || []).filter(
      (p) =>
        p.status === "captured" &&
        p.order_id === payment.razorpay_order_id &&
        Number(p.amount) === Number(payment.amount_paise) &&
        p.currency === payment.currency,
    );
    if (matches.length > 1)
      throw new Error("Multiple captures need manual review.");
    const remote = matches[0];
    if (!remote) {
      if (
        payment.status === "failed" &&
        ["created", "attempted"].includes(remoteOrder.status)
      )
        await transaction(async (client) => {
          await client.query(
            "UPDATE payments SET status='created',failure_reason=NULL,updated_at=now() WHERE id=$1 AND status='failed'",
            [payment.id],
          );
          await client.query(
            "UPDATE payment_attempts SET status='created',provider_status=$2,last_checked_at=now(),updated_at=now() WHERE id=$1",
            [payment.payment_attempt_id, remoteOrder.status],
          );
          await client.query(
            "INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'payment.retry_enabled','payment',$2)",
            [actorId, payment.id],
          );
        });
      continue;
    }
    const refunds = await provider.refunds.all({
      payment_id: remote.id,
      count: 100,
    });
    await transaction(async (client) => {
      const locked = (
        await client.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
          payment.id,
        ])
      ).rows[0];
      if (
        locked.razorpay_payment_id &&
        locked.razorpay_payment_id !== remote.id
      )
        throw new Error("Conflicting payment IDs.");
      if (["created", "authorized", "failed"].includes(locked.status)) {
        await client.query(
          "UPDATE payments SET status='captured',razorpay_payment_id=$2,captured_at=COALESCE(captured_at,now()),updated_at=now() WHERE id=$1",
          [payment.id, remote.id],
        );
        await client.query(
          `UPDATE bookings SET status=CASE WHEN $2='deposit' AND status='quotation_ready' THEN 'advance_paid' ELSE status END,
          booked_at=CASE WHEN $2='deposit' THEN COALESCE(booked_at,now()) ELSE booked_at END,
          balance_paid_at=CASE WHEN $2='balance' THEN COALESCE(balance_paid_at,now()) ELSE balance_paid_at END,updated_at=now() WHERE id=$1`,
          [bookingId, payment.purpose],
        );
        await client.query(
          "INSERT INTO user_notifications(user_id,title,message,kind) VALUES($1,'Trip payment received','Your payment has been reconciled with the provider.','payment')",
          [payment.user_id],
        );
        await enqueueEmail(
          client,
          payment.user_id,
          `capture:${payment.id}`,
          "payment_captured",
          "Your KuboVistas payment was captured",
          { path: "/account/payments" },
        );
      }
      if (payment.payment_attempt_id)
        await client.query(
          "UPDATE payment_attempts SET status='captured',provider_status='paid',last_checked_at=now(),updated_at=now() WHERE id=$1",
          [payment.payment_attempt_id],
        );
      for (const refund of refunds.items || [])
        if (
          refund.payment_id === remote.id &&
          ["pending", "processed", "failed"].includes(refund.status)
        )
          await syncRefund(
            client,
            refund,
            { ...locked, razorpay_payment_id: remote.id },
            actorId,
          );
      await client.query(
        "INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'payment.reconciled','payment',$2)",
        [actorId, payment.id],
      );
    });
  }
  await flushEmailSafely();
  return { reconciled: local.length };
}
