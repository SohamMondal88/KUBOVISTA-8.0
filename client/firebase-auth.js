import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";
import {
  app,
  appCheckToken,
  requestPushToken,
  disablePush,
  listenForPush,
} from "./firebase.js";
import { googleClientId } from "./firebase-config.js";
export const auth = getAuth(app);
const ready = new Promise((resolve) => {
  const stop = onAuthStateChanged(auth, () => {
    stop();
    resolve();
  });
});
let pushToken;
let pushListener;
function reportClientSignal(event) {
  try {
    const body = JSON.stringify({
      event,
      path: location.pathname.slice(0, 120),
    });
    if (navigator.sendBeacon)
      navigator.sendBeacon(
        "/api/config?service=client-signal",
        new Blob([body], { type: "application/json" }),
      );
  } catch {}
}
export async function apiFetch(path, options = {}) {
  const url = new URL(path, location.origin);
  const headers = new Headers(options.headers || {});
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
    await ready;
    if (auth.currentUser)
      headers.set(
        "Authorization",
        "Bearer " + (await auth.currentUser.getIdToken()),
      );
    if (!["GET", "HEAD"].includes((options.method || "GET").toUpperCase())) {
      try {
        const token = await appCheckToken();
        if (token) headers.set("X-Firebase-AppCheck", token);
      } catch (error) {
        reportClientSignal("app-check-token-failed");
        const failure = Error(
          "App verification failed after a refresh attempt. Reload the page, disable privacy extensions for this site if needed, and try again.",
        );
        failure.code = error?.code || "app-check/token-unavailable";
        throw failure;
      }
    }
  }
  return fetch(path, { ...options, headers });
}
async function server(path, options = {}) {
  const response = await apiFetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const type = response.headers.get("content-type") || "";
  let data = {};
  if (type.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  } else {
    try {
      await response.text();
    } catch {}
  }
  if (!response.ok)
    throw Error(
      data.error ||
        "Account service is temporarily unavailable. Please try again shortly.",
    );
  return data;
}
function friendly(error) {
  const messages = {
    "auth/invalid-credential":
      "Email or password is incorrect. Migrated accounts must use Forgot password first.",
    "auth/email-already-in-use":
      "This email already has an account. Sign in or reset your password.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email. Sign in using its original method, then link Google from account settings.",
    "auth/too-many-requests":
      "Too many attempts. Please wait before trying again.",
    "auth/popup-blocked": "Allow the Google sign-in popup and try again.",
    "auth/popup-closed-by-user":
      "Google sign-in was closed. You can try again.",
    "auth/unauthorized-domain":
      "This website domain must be enabled in Firebase Authentication.",
    "auth/operation-not-allowed": "This sign-in method is not enabled yet.",
    "auth/requires-recent-login":
      "Sign in again before changing account security.",
  };
  return Error(
    messages[error.code] ||
      (error.code
        ? "Firebase could not complete this request. Please try again or contact support."
        : error.message),
  );
}
async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user) throw Error("Please sign in again.");
  if (user.providerData.some((p) => p.providerId === "password"))
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    );
  else if (user.providerData.some((p) => p.providerId === "google.com"))
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  else
    throw Error("This sign-in method needs support-assisted account changes.");
}
async function refreshIdentity() {
  if (auth.currentUser) {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
  }
}
let googleIdentity;
let googleInitialized = false;
let googleCredentialHandler;
let googleScriptPromise;
function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      "script[data-kubovistas-google-identity]",
    );
    const script = existing || document.createElement("script");
    const timeout = setTimeout(
      () =>
        reject(
          Error(
            "Google sign-in took too long to load. Check your connection and try again.",
          ),
        ),
      10000,
    );
    const finish = () => {
      clearTimeout(timeout);
      window.google?.accounts?.id
        ? resolve()
        : reject(
            Error(
              "Google sign-in could not be loaded. Check your connection and try again.",
            ),
          );
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(
          Error(
            "Google sign-in could not be loaded. Check your connection and try again.",
          ),
        );
      },
      { once: true },
    );
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.kubovistasGoogleIdentity = "true";
      document.head.append(script);
    }
  }).catch((error) => {
    googleScriptPromise = undefined;
    throw error;
  });
  return googleScriptPromise;
}
async function getGoogleIdentity() {
  if (googleIdentity) return googleIdentity;
  await loadGoogleIdentityScript();
  return (googleIdentity = window.google.accounts.id);
}
export async function mountGoogleSignIn(
  target,
  { text = "continue_with", onCredential } = {},
) {
  if (!target || typeof onCredential !== "function") return;
  const identity = await getGoogleIdentity();
  googleCredentialHandler = onCredential;
  if (!target.isConnected) return;
  if (!googleInitialized) {
    identity.initialize({
      client_id: googleClientId,
      callback: (response) => {
        const handler = googleCredentialHandler;
        if (!response?.credential || !handler) return;
        void handler(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    googleInitialized = true;
  }
  target.replaceChildren();
  identity.renderButton(target, {
    type: "standard",
    theme: "outline",
    size: "large",
    text,
    shape: "pill",
    logo_alignment: "left",
    width: Math.min(360, Math.max(240, target.clientWidth || 320)),
  });
}
export async function authRequest(path, options = {}) {
  await ready;
  const body = options.body ? JSON.parse(options.body) : {};
  const action = path.split("/").pop();
  try {
    if (action === "get-session") {
      if (!auth.currentUser) return null;
      await refreshIdentity();
      return server("/api/auth/get-session");
    }
    if (action === "sign-in/email" || path.endsWith("/sign-in/email")) {
      if (auth.currentUser) await logout();
      await setPersistence(
        auth,
        body.rememberMe ? browserLocalPersistence : browserSessionPersistence,
      );
      await signInWithEmailAndPassword(auth, body.email, body.password);
      await refreshIdentity();
      if (!auth.currentUser.emailVerified) {
        location.hash = "/verify-email?email=" + encodeURIComponent(body.email);
        throw Error("Verify your email before accessing your account.");
      }
      try {
        return await server("/api/auth/get-session");
      } catch (error) {
        await signOut(auth);
        throw error;
      }
    }
    if (path.endsWith("/sign-up/email")) {
      await setPersistence(auth, browserLocalPersistence);
      const { user } = await createUserWithEmailAndPassword(
        auth,
        body.email,
        body.password,
      );
      await updateProfile(user, { displayName: body.name });
      try {
        await sendEmailVerification(user, {
          url: location.origin + "/account/login",
        });
      } catch {
        location.hash = "/verify-email?email=" + encodeURIComponent(body.email);
        throw Error(
          "Account created, but the verification email could not be sent. Use Send another link.",
        );
      }
      return { success: true };
    }
    if (path.endsWith("/sign-in/google-credential")) {
      if (
        typeof body.credential !== "string" ||
        body.credential.length < 100 ||
        body.credential.length > 10000
      )
        throw Error(
          "Google returned an invalid sign-in response. Please try again.",
        );
      await setPersistence(auth, browserLocalPersistence);
      if (auth.currentUser) await logout();
      await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(body.credential),
      );
      await refreshIdentity();
      try {
        return await server("/api/auth/get-session");
      } catch (error) {
        await signOut(auth);
        throw error;
      }
    }
    if (path.endsWith("/sign-in/social")) {
      await setPersistence(auth, browserLocalPersistence);
      if (auth.currentUser) await logout();
      await signInWithPopup(auth, new GoogleAuthProvider());
      try {
        await server("/api/auth/get-session");
      } catch (error) {
        await signOut(auth);
        throw error;
      }
      return { url: location.origin + "/account/dashboard" };
    }
    if (action === "request-password-reset") {
      try {
        await sendPasswordResetEmail(auth, body.email, {
          url: location.origin + "/account/login",
        });
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
      return { success: true };
    }
    if (action === "reset-password") {
      await confirmPasswordReset(auth, body.token, body.newPassword);
      return { success: true };
    }
    if (action === "send-verification-email") {
      if (!auth.currentUser)
        throw Error("Sign in first, then request a new verification email.");
      await sendEmailVerification(auth.currentUser, {
        url: location.origin + "/account/login",
      });
      return { success: true };
    }
    if (action === "change-password") {
      await reauthenticate(body.currentPassword);
      await updatePassword(auth.currentUser, body.newPassword);
      await auth.currentUser.getIdToken(true);
      if (body.revokeOtherSessions) {
        await server("/api/auth/revoke-sessions", { method: "POST" });
        await logout();
        location.hash = "/login";
      }
      return { success: true };
    }
    if (action === "revoke-sessions") {
      await reauthenticate(body.password);
      await server("/api/auth/revoke-sessions", { method: "POST" });
      await logout();
      location.hash = "/login";
      return { success: true };
    }
    if (action === "delete-user") {
      await reauthenticate(body.password);
      await server("/api/auth/delete-user", { method: "POST" });
      await logout();
      return { success: true };
    }
    if (action === "sign-out") {
      await logout();
      return { success: true };
    }
    throw Error("Unsupported account action.");
  } catch (error) {
    throw friendly(error);
  }
}
async function logout() {
  try {
    let opted = false;
    try {
      opted =
        localStorage.getItem("kubovistas.push.uid") === auth.currentUser?.uid;
    } catch {}
    if (pushToken || opted) await disableBookingPush();
  } catch {
    console.warn("Device cleanup was incomplete; browser sign-out continues.");
  } finally {
    await signOut(auth);
    window.dispatchEvent(new Event("kubovistas-auth-changed"));
  }
}
export async function enableBookingPush() {
  await ready;
  if (!auth.currentUser?.emailVerified)
    throw Error("Sign in with a verified account first.");
  const uid = auth.currentUser.uid;
  const token = await requestPushToken();
  if (auth.currentUser?.uid !== uid) {
    await disablePush();
    throw Error("Your account changed. Please try again.");
  }
  await server("/api/notifications", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  pushToken = token;
  try {
    localStorage.setItem("kubovistas.push.uid", uid);
  } catch {}
  if (!pushListener)
    pushListener = await listenForPush(() =>
      window.dispatchEvent(new Event("kubovistas-booking-update")),
    );
  return true;
}
export async function disableBookingPush() {
  let error;
  try {
    // Clear all registered devices for this account when this browser has lost its token.
    if (auth.currentUser)
      await server("/api/notifications", {
        method: "DELETE",
        body: JSON.stringify(pushToken ? { token: pushToken } : { all: true }),
      });
  } catch (e) {
    error = e;
  } finally {
    try {
      await disablePush();
    } finally {
      pushToken = undefined;
      pushListener?.();
      pushListener = undefined;
      try {
        localStorage.removeItem("kubovistas.push.uid");
      } catch {}
    }
  }
  if (error) throw error;
}
// Refresh only an existing, account-specific opt-in. Never prompt on page load.
void ready
  .then(async () => {
    const opted = localStorage.getItem("kubovistas.push.uid");
    if (!opted) return;
    if (opted !== auth.currentUser?.uid) {
      await disablePush();
      localStorage.removeItem("kubovistas.push.uid");
      return;
    }
    if ("Notification" in window && Notification.permission === "granted")
      await enableBookingPush();
  })
  .catch(() => {});
onAuthStateChanged(auth, () =>
  window.dispatchEvent(new Event("kubovistas-auth-changed")),
);

window.addEventListener("kubovistas-booking-update", () => {
  document.getElementById("booking-push-notice")?.remove();
  const notice = document.createElement("aside");
  notice.id = "booking-push-notice";
  notice.className = "booking-push-notice";
  notice.setAttribute("role", "status");
  notice.innerHTML =
    '<span>You have a new KuboVistas account update.</span> <a href="/notifications">View updates</a> <button type="button" aria-label="Dismiss booking update">×</button>';
  notice.querySelector("button").onclick = () => notice.remove();
  document.body.append(notice);
});
