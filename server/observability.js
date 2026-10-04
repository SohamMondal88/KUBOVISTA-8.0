import { randomUUID } from "node:crypto";

const safeToken = (value, max = 120) =>
  String(value || "")
    .replace(/[^a-zA-Z0-9._:/-]/g, "-")
    .slice(0, max);

export function requestId(req) {
  return (
    safeToken(
      req?.headers?.["x-vercel-id"] || req?.headers?.["x-request-id"],
    ) || randomUUID()
  );
}

export function logEvent(level, event, metadata = {}) {
  const record = {
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    event: safeToken(event, 80),
    timestamp: new Date().toISOString(),
  };
  for (const key of [
    "requestId",
    "route",
    "code",
    "status",
    "durationMs",
    "provider",
    "operation",
    "bucket",
  ]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value))
      record[key] = value;
    else if (typeof value === "string") record[key] = safeToken(value);
  }
  const output = JSON.stringify(record);
  if (record.level === "error") console.error(output);
  else if (record.level === "warn") console.warn(output);
  else console.log(output);
}

export function safeErrorCode(error) {
  return safeToken(error?.code || error?.name || "internal-error", 80);
}
