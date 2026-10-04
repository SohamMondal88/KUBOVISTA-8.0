const baseUrl = String(process.env.PRODUCTION_URL || "").replace(/\/$/, "");
if (!/^https:\/\//.test(baseUrl))
  throw new Error("PRODUCTION_URL must be an HTTPS origin.");

const timeout = AbortSignal.timeout(10_000);
const [home, config] = await Promise.all([
  fetch(`${baseUrl}/`, { redirect: "manual", signal: timeout }),
  fetch(`${baseUrl}/api/config`, {
    headers: { accept: "application/json" },
    signal: timeout,
  }),
]);

if (!home.ok) throw new Error(`Homepage readiness failed with ${home.status}.`);
if (!config.ok)
  throw new Error(`Configuration readiness failed with ${config.status}.`);

const csp = home.headers.get("content-security-policy-report-only") || "";
for (const directive of [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
])
  if (!csp.includes(directive))
    throw new Error(`CSP readiness is missing ${directive}.`);

const body = await config.json();
if (body?.status !== "configuration" || typeof body?.configured !== "object")
  throw new Error("Configuration response has an unexpected schema.");

console.log(
  JSON.stringify({
    checkedAt: new Date().toISOString(),
    url: baseUrl,
    homepage: home.status,
    configured: body.configured,
    paymentMode: body.paymentMode || null,
    cspReportOnly: true,
  }),
);
