const baseUrl = String(process.env.PRODUCTION_URL || "").replace(/\/$/, "");
if (!/^https:\/\//.test(baseUrl))
  throw new Error("PRODUCTION_URL must be an HTTPS origin.");

const readinessSecret = String(process.env.READINESS_SECRET || "");
if (readinessSecret.length < 32)
  throw new Error("READINESS_SECRET must contain at least 32 characters.");

const [home, config, readiness] = await Promise.all([
  fetch(`${baseUrl}/`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  }),
  fetch(`${baseUrl}/api/config`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  }),
  fetch(`${baseUrl}/api/config?service=readiness`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${readinessSecret}`,
    },
    signal: AbortSignal.timeout(12_000),
  }),
]);

if (!home.ok) throw new Error(`Homepage readiness failed with ${home.status}.`);
if (!config.ok)
  throw new Error(`Configuration readiness failed with ${config.status}.`);
if (!readiness.ok)
  throw new Error(`Protected readiness failed with ${readiness.status}.`);

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
const health = await readiness.json();
if (health?.status !== "ready" || health?.ready !== true)
  throw new Error("Protected readiness response is not ready.");

console.log(
  JSON.stringify({
    checkedAt: new Date().toISOString(),
    url: baseUrl,
    homepage: home.status,
    configured: body.configured,
    paymentMode: body.paymentMode || null,
    readiness: Object.fromEntries(
      Object.entries(health.checks || {}).map(([name, check]) => [
        name,
        check.ready === true,
      ]),
    ),
    cspReportOnly: true,
  }),
);
