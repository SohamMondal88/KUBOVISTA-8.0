import { logEvent, requestId, safeErrorCode } from "./observability.js";

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (body?.requestId) res.setHeader("X-Request-ID", body.requestId);
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  return json(res, 405, { error: "Method not allowed." });
}

export function publicError(error, { req, route = "api" } = {}) {
  const id = requestId(req);
  const code = safeErrorCode(error);
  const status =
    error?.code === "23505" ? 409 : error?.code === "23503" ? 400 : 500;
  logEvent("error", "request.failed", { requestId: id, route, code, status });
  if (error?.code === "23505")
    return { status, message: "That record already exists.", requestId: id };
  if (error?.code === "23503")
    return {
      status,
      message: "A related record could not be found.",
      requestId: id,
    };
  return {
    status,
    message: "Something went wrong. Please try again.",
    requestId: id,
  };
}

export function cleanText(value, max = 500) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

export function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export async function readRawBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
