// Called only for provider-confirmed refund entities. Never infer a refund from
// an amount in a checkout callback or from an unverified browser request.
export async function syncRefund(client, entity, payment, actorId = null) {
  if (
    entity.payment_id !== payment.razorpay_payment_id ||
    !["pending", "processed", "failed"].includes(entity.status)
  )
    throw new Error("Refund provider mismatch.");
  const existing = (
    await client.query(
      "SELECT * FROM payment_refunds WHERE razorpay_refund_id=$1 FOR UPDATE",
      [entity.id],
    )
  ).rows[0];
  if (
    existing &&
    (existing.payment_id !== payment.id ||
      Number(existing.amount_paise) !== Number(entity.amount))
  )
    throw new Error("Conflicting refund record.");
  const requested =
    existing ||
    (
      await client.query(
        "SELECT * FROM payment_refunds WHERE payment_id=$1 AND status='requested' FOR UPDATE",
        [payment.id],
      )
    ).rows[0];
  if (requested && Number(requested.amount_paise) !== Number(entity.amount))
    throw new Error("Refund amount mismatch.");
  if (requested?.status === "processed" && entity.status !== "processed")
    return requested;
  const result = requested
    ? await client.query(
        `UPDATE payment_refunds SET razorpay_refund_id=$2,status=$3,submission_state='confirmed',last_checked_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,
        [requested.id, entity.id, entity.status],
      )
    : await client.query(
        `INSERT INTO payment_refunds(payment_id,razorpay_refund_id,request_key,amount_paise,status,submission_state,last_checked_at,requested_by)
      VALUES($1,$2,$3,$4,$5,'confirmed',now(),$6) RETURNING *`,
        [
          payment.id,
          entity.id,
          `external:${entity.id}`,
          entity.amount,
          entity.status,
          actorId,
        ],
      );
  const totals = await client.query(
    `SELECT COALESCE(sum(amount_paise) FILTER (WHERE status='processed'),0) AS processed,
    count(*) FILTER (WHERE status IN ('requested','pending')) AS pending FROM payment_refunds WHERE payment_id=$1`,
    [payment.id],
  );
  const full = Number(totals.rows[0].processed) >= Number(payment.amount_paise);
  await client.query(
    `UPDATE payments SET status=$2,updated_at=now() WHERE id=$1`,
    [
      payment.id,
      full
        ? "refunded"
        : Number(totals.rows[0].pending)
          ? "refund_pending"
          : "captured",
    ],
  );
  if (requested?.status !== entity.status) {
    await client.query(
      `INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,$2,'payment',$3,$4)`,
      [
        actorId,
        `refund.${entity.status}`,
        payment.id,
        JSON.stringify({ refund_id: entity.id, amount_paise: entity.amount }),
      ],
    );
    await client.query(
      `INSERT INTO user_notifications(user_id,title,message,kind) VALUES($1,'Refund update',$2,'payment')`,
      [
        payment.user_id,
        `Your refund is ${entity.status}. Check your payment history for details.`,
      ],
    );
  }
  return result.rows[0];
}
