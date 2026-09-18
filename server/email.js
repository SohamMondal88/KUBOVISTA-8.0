function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

export { emailConfigured };

export async function sendAuthEmail({ to, subject, heading, message, actionLabel, actionUrl }) {
  if (!emailConfigured()) {
    throw new Error('Transactional email is not configured.');
  }
  const safeUrl = new URL(actionUrl);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: [to],
      subject,
      html: `<div style="background:#0d1d17;padding:40px;font-family:Arial,sans-serif;color:#f1f1e9"><div style="max-width:560px;margin:auto"><p style="color:#cde77f;letter-spacing:.16em;font-size:12px">KUBOVISTA 8.0</p><h1 style="font:42px Georgia,serif;margin:24px 0">${heading}</h1><p style="color:#bac7be;line-height:1.7">${message}</p><a href="${safeUrl.href}" style="display:inline-block;margin-top:22px;background:#cde77f;color:#102019;padding:14px 20px;border-radius:5px;text-decoration:none;font-weight:bold">${actionLabel}</a><p style="margin-top:28px;color:#839188;font-size:12px;line-height:1.6">If you did not request this, you can ignore this email. Never share a password or verification link.</p></div></div>`
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}
