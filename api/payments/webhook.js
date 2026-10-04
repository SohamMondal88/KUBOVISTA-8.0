import { flushPushSafely } from "../../server/firebase-push.js";
import {
  enqueueEmail,
  flushEmailSafely,
} from "../../server/transactional-email.js";
import { createHash } from "node:crypto";
import { transaction } from "../../server/db.js";
import {
  json,
  methodNotAllowed,
  publicError,
  readRawBody,
} from "../../server/http.js";
import { verifyWebhookSignature } from "../../server/razorpay.js";
import { syncRefund } from "../../server/refund-state.js";
import { logEvent, requestId } from "../../server/observability.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const started = Date.now();
  const id = requestId(req);
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const raw = await readRawBody(req);
    if (!verifyWebhookSignature(raw, req.headers["x-razorpay-signature"]))
      return json(res, 400, { error: "Invalid webhook signature." });
    const event = JSON.parse(raw.toString("utf8"));
    const eventId = String(
      req.headers["x-razorpay-event-id"] ||
        event.id ||
        createHash("sha256").update(raw).digest("hex"),
    );
    const entity =
      event.payload?.payment?.entity || event.payload?.refund?.entity;
    const digest = createHash("sha256").update(raw).digest("hex");
    await transaction(async (client) => {
      const stored = await client.query(
        `INSERT INTO payment_webhook_events
        (event_id,event_type,payload_sha256,provider_entity_id,provider_order_id,provider_status,payload)
        VALUES ($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [
          eventId,
          String(event.event || "unknown").slice(0, 100),
          digest,
          String(entity?.id || "").slice(0, 120) || null,
          String(entity?.order_id || "").slice(0, 120) || null,
          String(entity?.status || "").slice(0, 80) || null,
        ],
      );
      if (!stored.rows[0]) return;
      if (!entity) {
        await client.query(
          "UPDATE payment_webhook_events SET processed_at=now() WHERE event_id=$1",
          [eventId],
        );
        return;
      }
      if (event.event === "payment.captured") {
        const updated = await client.query(
          `UPDATE payments SET razorpay_payment_id=$1,status='captured',captured_at=now(),updated_at=now() WHERE razorpay_order_id=$2 AND amount_paise=$3 AND currency=$4 AND status IN ('created','authorized','failed') AND (razorpay_payment_id IS NULL OR razorpay_payment_id=$1) RETURNING id,booking_id,user_id,purpose`,
          [entity.id, entity.order_id, entity.amount, entity.currency],
        );
        if (updated.rows[0])
          await client.query(
            `UPDATE bookings SET status=CASE WHEN $2='deposit' AND status='quotation_ready' THEN 'advance_paid' ELSE status END,booked_at=CASE WHEN $2='deposit' THEN COALESCE(booked_at,now()) ELSE booked_at END,balance_paid_at=CASE WHEN $2='balance' THEN COALESCE(balance_paid_at,now()) ELSE balance_paid_at END,updated_at=now() WHERE id=$1`,
            [updated.rows[0].booking_id, updated.rows[0].purpose],
          );
        if (updated.rows[0])
          await client.query(
            "INSERT INTO user_notifications(user_id,title,message,kind) VALUES($1,'Trip payment received','Your payment was captured. Sign in to review your trip and payment record.','payment')",
            [updated.rows[0].user_id],
          );
        if (updated.rows[0])
          await enqueueEmail(
            client,
            updated.rows[0].user_id,
            `capture:${updated.rows[0].id}`,
            "payment_captured",
            "Your KuboVistas payment was captured",
            { path: "/account/payments" },
          );
        await client.query(
          `UPDATE payment_attempts SET status='captured',provider_status='paid',last_checked_at=now(),updated_at=now()
          WHERE provider_order_id=$1`,
          [entity.order_id],
        );
      } else if (event.event === "payment.failed") {
        await client.query(
          `UPDATE payments SET status='failed',failure_reason=$1,updated_at=now() WHERE razorpay_order_id=$2 AND status IN ('created','failed')`,
          [
            entity.error_description || entity.error_reason || "Payment failed",
            entity.order_id,
          ],
        );
        await client.query(
          `UPDATE payment_attempts SET status='failed',provider_status='attempted',failure_code=$1,last_checked_at=now(),updated_at=now()
          WHERE provider_order_id=$2 AND status NOT IN ('captured','authorized')`,
          [
            String(
              entity.error_code || entity.error_reason || "payment-failed",
            ).slice(0, 80),
            entity.order_id,
          ],
        );
      } else if (
        ["refund.created", "refund.processed", "refund.failed"].includes(
          event.event,
        )
      ) {
        const payment = (
          await client.query(
            "SELECT * FROM payments WHERE razorpay_payment_id=$1 FOR UPDATE",
            [entity.payment_id],
          )
        ).rows[0];
        if (
          !payment ||
          Number(entity.amount) > Number(payment.amount_paise) ||
          entity.currency !== payment.currency
        )
          throw new Error("Unknown refund or mismatched amount.");
        await syncRefund(
          client,
          {
            ...entity,
            status:
              event.event === "refund.created"
                ? "pending"
                : event.event.split(".")[1],
          },
          payment,
        );
      }
      await client.query(
        "UPDATE payment_webhook_events SET processed_at=now() WHERE event_id=$1",
        [eventId],
      );
    });
    await flushPushSafely();
    await flushEmailSafely();
    logEvent("info", "payment.webhook.processed", {
      requestId: id,
      route: "payments.webhook",
      status: 200,
      durationMs: Date.now() - started,
      provider: "razorpay",
    });
    return json(res, 200, { received: true, requestId: id });
  } catch (error) {
    const failure = publicError(error, { req, route: "payments.webhook" });
    return json(res, failure.status, {
      error: failure.message,
      requestId: failure.requestId,
    });
  }
}
