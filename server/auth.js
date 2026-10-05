import { checkAppToken } from "./app-check.js";
import { getAuth as firebaseAuth } from "firebase-admin/auth";
import { firebaseAdminConfigured, getFirebaseAdmin } from "./firebase-admin.js";
import { resolveFirebaseUser } from "./firebase-identity.js";
import { databaseConfigured } from "./db.js";
import { json } from "./http.js";
import { logEvent, requestId, safeErrorCode } from "./observability.js";
export function authConfigured() {
  return (
    firebaseAdminConfigured() &&
    databaseConfigured() &&
    Boolean(process.env.APP_URL)
  );
}
export function getAuth() {
  return firebaseAuth(getFirebaseAdmin());
}
export function allowedOrigins(env = process.env) {
  const candidates = [env.APP_URL, ...(env.APP_ORIGINS || "").split(",")];
  const origins = new Set();
  for (const candidate of candidates) {
    if (!candidate?.trim() || candidate.includes("*")) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === "https:" || url.hostname === "localhost")
        origins.add(url.origin);
    } catch {}
  }
  return origins;
}
export function originAllowed(req) {
  return allowedOrigins().has(req.headers.origin);
}
export async function readFirebaseSession(
  req,
  {
    configured = authConfigured,
    verify = (token, revoked) => getAuth().verifyIdToken(token, revoked),
    resolve = (decoded) => resolveFirebaseUser(decoded),
  } = {},
) {
  const header = req.headers.authorization || "";
  if (!/^Bearer [^\s]+$/.test(header)) return null;
  if (!configured())
    throw Object.assign(
      new Error("Firebase accounts are not configured yet."),
      { status: 503 },
    );
  let decoded;
  try {
    decoded = await verify(header.slice(7), true);
  } catch (error) {
    if (
      [
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/invalid-id-token",
        "auth/argument-error",
        "auth/user-disabled",
        "auth/user-not-found",
      ].includes(error.code)
    )
      return null;
    logEvent("error", "auth.identity-verification-failed", {
      code: safeErrorCode(error),
      provider: "firebase",
    });
    throw Object.assign(
      new Error("Identity verification is temporarily unavailable."),
      { status: 503 },
    );
  }
  const user = await resolve(decoded);
  const factors = decoded.firebase?.sign_in_second_factor;
  return {
    user,
    authTime: decoded.auth_time,
    firebaseUid: decoded.uid,
    mfaVerified: Boolean(factors),
  };
}
export const getSession = (req) => readFirebaseSession(req);
export async function requireSession(req, res) {
  const id = requestId(req);
  if (!["GET", "HEAD"].includes(req.method) && !originAllowed(req)) {
    logEvent("warn", "auth.origin-denied", {
      requestId: id,
      route: req.url || "account-mutation",
      status: 403,
    });
    json(res, 403, { error: "Request origin is not allowed.", requestId: id });
    return null;
  }
  try {
    if (!["GET", "HEAD"].includes(req.method) && !(await checkAppToken(req))) {
      json(res, 403, {
        error: "App verification failed. Please reload and try again.",
        requestId: id,
      });
      return null;
    }
    const session = await getSession(req);
    if (!session) {
      json(res, 401, { error: "Please sign in to continue.", requestId: id });
      return null;
    }
    return session;
  } catch (error) {
    logEvent("error", "auth.session-unavailable", {
      requestId: id,
      code: safeErrorCode(error),
      status: error.status || 503,
      provider: "firebase",
    });
    json(res, error.status || 503, {
      error: error.status
        ? error.message
        : "Account service is unavailable. Please try again.",
      requestId: id,
    });
    return null;
  }
}
export function isAdmin(session) {
  return (
    session?.user?.emailVerified === true &&
    session?.mfaVerified === true &&
    session?.user?.role === "admin"
  );
}
export function isOperator(session) {
  return (
    session?.user?.emailVerified === true &&
    (isAdmin(session) || session.user.role === "operator")
  );
}
