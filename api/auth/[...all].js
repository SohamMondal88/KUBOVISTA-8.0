import { requireSession, getAuth } from "../../server/auth.js";
import { query } from "../../server/db.js";
import { json, methodNotAllowed } from "../../server/http.js";
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  const action = new URL(req.url, "http://localhost").pathname.split("/").pop();
  if (!["get-session", "revoke-sessions", "delete-user"].includes(action))
    return json(res, 404, {
      error:
        "Use Firebase Authentication for sign-in, verification and password recovery.",
    });
  if (req.method !== (action === "get-session" ? "GET" : "POST"))
    return methodNotAllowed(res, [action === "get-session" ? "GET" : "POST"]);
  const session = await requireSession(req, res);
  if (!session) return;
  if (action === "get-session") return json(res, 200, { user: session.user });
  if (!session.authTime || Date.now() / 1000 - session.authTime > 300)
    return json(res, 401, {
      error: "Sign in again before changing account security.",
    });
  if (action === "delete-user")
    return json(res, 409, {
      error:
        "Account closure requires support review so identity, privacy and financial retention obligations are handled consistently.",
    });
  try {
    if (action === "revoke-sessions") {
      await getAuth().revokeRefreshTokens(session.firebaseUid);
      await query("DELETE FROM firebase_devices WHERE user_id=$1", [
        session.user.id,
      ]);
      return json(res, 200, { success: true });
    }
  } catch {
    return json(res, 503, {
      error:
        "The security operation needs support review. Please do not create a replacement account.",
    });
  }
}
