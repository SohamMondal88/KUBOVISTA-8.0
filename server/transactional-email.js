import { timingSafeEqual } from "node:crypto";
import { getPool } from "./db.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const paths = new Set([
  "/account/bookings",
  "/account/payments",
  "/account/support",
  "/account/documents",
]);
export function emailDispatchAuthorized(
  header,
  secret = process.env.EMAIL_DISPATCH_SECRET,
) {
  if (!secret || secret.length < 32 || typeof header !== "string") return false;
  const left = Buffer.from(`Bearer ${secret}`),
    right = Buffer.from(header);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function enqueueEmail(
  client,
  userId,
  key,
  template,
  subject,
  payload,
) {
  if (!paths.has(payload.path))
    throw new Error("Unsupported email destination.");
  await client.query(
    `INSERT INTO email_outbox(user_id,event_key,template,subject,payload) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(event_key) DO NOTHING`,
    [userId, key, template, subject, JSON.stringify(payload)],
  );
}
export async function dispatchEmail({
  pool = getPool(),
  send = sendResend,
} = {}) {
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.AUTH_EMAIL_FROM ||
    !process.env.APP_URL
  )
    return { enabled: false, sent: 0 };
  const { rows } =
    await pool.query(`UPDATE email_outbox e SET status='sending',locked_until=now()+interval '2 minutes',attempts=attempts+1
 FROM(SELECT id FROM email_outbox WHERE sent_at IS NULL AND available_at<=now()
 AND (locked_until IS NULL OR locked_until<now()) AND attempts<6 AND status!='skipped'
 ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 20) claim WHERE e.id=claim.id RETURNING e.*`);
  let sent = 0;
  for (const item of rows) {
    try {
      const user = (
        await pool.query(
          'SELECT email FROM "user" WHERE id=$1 AND disabled_at IS NULL',
          [item.user_id],
        )
      ).rows[0];
      if (!user) throw new Error("Account is unavailable.");
      if (["quote_ready", "booking_confirmed"].includes(item.template)) {
        const settings = await pool.query(
          "SELECT email_trip_updates FROM traveler_settings WHERE user_id=$1",
          [item.user_id],
        );
        if (settings.rows[0]?.email_trip_updates === false) {
          await pool.query(
            "UPDATE email_outbox SET status='skipped',locked_until=NULL,last_error=NULL WHERE id=$1",
            [item.id],
          );
          continue;
        }
      }
      const path = paths.has(item.payload.path)
        ? item.payload.path
        : "/account/dashboard";
      const url = new URL(path, new URL(process.env.APP_URL).origin).href;
      const details = item.payload.number
        ? ` Reference ${escape(item.payload.number)}.`
        : "";
      const html = `<div style="font-family:Arial,sans-serif;color:#102019;max-width:550px;margin:auto"><h1>KuboVistas</h1><p>${escape(item.subject)}.${details}</p><p>Sign in to view your private account update.</p><a href="${escape(url)}">Open your account</a><p>If you did not expect this update, contact support through the website. Never share a password or payment code by email.</p></div>`;
      const providerId = await send({
        to: user.email,
        subject: item.subject,
        html,
        key: item.event_key,
      });
      await pool.query(
        "UPDATE email_outbox SET status='sent',sent_at=now(),provider_message_id=$2,locked_until=NULL,last_error=NULL WHERE id=$1",
        [item.id, providerId],
      );
      sent++;
    } catch (error) {
      await pool.query(
        `UPDATE email_outbox SET status='failed',locked_until=NULL,available_at=now()+interval '5 minutes',last_error=$2 WHERE id=$1`,
        [
          item.id,
          String(error?.message || "Email delivery failed").slice(0, 160),
        ],
      );
    }
  }
  return { enabled: true, claimed: rows.length, sent };
}
async function sendResend({ to, subject, html, key }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(`Email provider returned ${response.status}.`);
  return (await response.json()).id;
}
export async function flushEmailSafely() {
  let timer;
  try {
    await Promise.race([
      dispatchEmail().catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
