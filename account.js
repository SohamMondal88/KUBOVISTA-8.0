import { renderGrowthPrivate } from "./growth-ui.js";
import {
  apiFetch,
  authRequest,
  enableBookingPush,
  disableBookingPush,
  mountGoogleSignIn,
} from "/firebase-auth-client.js";
import {
  policyMarkup,
  mountBookingActions,
  bookingFlowPage,
} from "./booking-ui.js";
import { mountWeather } from "./explore.js";

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise || 0) / 100);
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Flexible";
const initials = (name) =>
  String(name || "Traveler")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

let configCache;
let sessionCache;
window.addEventListener("kubovistas-auth-changed", () => {
  sessionCache = undefined;
  const parts = location.pathname.split("/").filter(Boolean);
  const route = parts[0] === "account" ? parts[1] : parts[0] || "";
  if (
    accountRoutes.has(route) &&
    ![
      "login",
      "signup",
      "forgot-password",
      "reset-password",
      "verify-email",
    ].includes(route)
  ) {
    document.querySelector("main")?.replaceChildren();
    window.dispatchEvent(new Event("kubovistas:navigate"));
  }
  void syncAccountButton().catch(() => {});
});

async function request(path, options = {}) {
  if (path.startsWith("/api/auth/")) return authRequest(path, options);
  const response = await apiFetch(path, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok)
    throw new Error(
      data.error?.message ||
        data.error ||
        data.message ||
        `Request failed (${response.status}).`,
    );
  return data;
}

async function getConfig() {
  if (configCache) return configCache;
  try {
    const response = await request("/api/config");
    const configured = response.configured || {};
    configCache = {
      ...response,
      auth: configured.auth ?? response.auth ?? false,
      database: configured.database ?? response.database ?? false,
      payments: configured.payments ?? response.payments ?? false,
    };
  } catch {
    return {
      auth: false,
      database: false,
      emailVerification: false,
      google: false,
      payments: false,
      paymentMode: "unavailable",
      paymentProvider: "Razorpay",
      currency: "INR",
      advancePercent: 20,
    };
  }
  return configCache;
}

export async function getAccountSession(force = false) {
  if (!force && sessionCache !== undefined) return sessionCache;
  if (!(await getConfig()).auth) {
    sessionCache = null;
    return null;
  }
  try {
    sessionCache = await request("/api/auth/get-session");
  } catch (error) {
    // A backend outage is not a signed-out state. Keeping the cache unset lets
    // the next navigation retry instead of hiding account/payment UI forever.
    sessionCache = undefined;
    if (force) throw error;
  }
  return sessionCache;
}

export async function syncAccountButton() {
  const button = document.querySelector("#account-button");
  if (!button) return;
  const session = await getAccountSession();
  if (session?.user) {
    button.href = "/dashboard";
    button.setAttribute("aria-label", "Open your account");
    button.innerHTML = `<span class="account-avatar">${escapeHTML(initials(session.user.name))}</span><span class="account-label">${escapeHTML(session.user.name.split(" ")[0])}</span>`;
  } else {
    button.href = "/login";
    button.setAttribute("aria-label", "Sign in to KuboVistas");
    button.innerHTML =
      '<span class="account-avatar" aria-hidden="true">◎</span><span class="account-label">Sign in</span>';
  }
}

function setupNotice(config) {
  if (config.auth) return "";
  return `<div class="setup-notice" role="status"><strong>Online accounts are temporarily unavailable</strong><p>Accounts are not available yet. Please return shortly.</p><a href="/company/contact">Contact our travel team ↗</a></div>`;
}

function authLayout(kicker, title, copy, content, config) {
  return `<section class="auth-page"><div class="auth-story"><a class="back-link" href="/">← Back home</a><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${copy}</p><div class="auth-proof"><span><b>01</b> Your plans, together</span><span><b>02</b> Secure quotation payments</span><span><b>03</b> Support that remembers</span></div></div><div class="auth-panel">${setupNotice(config)}${content}<p class="auth-legal">By continuing, you acknowledge the <a href="/legal/terms">Terms</a> and <a href="/legal/privacy">Privacy Policy</a>.</p></div></section>`;
}

function field(label, name, type = "text", options = "") {
  return `<label>${label}<input name="${name}" type="${type}" ${options}></label>`;
}

async function setupGoogleAuth(toast, { signup = false, onSuccess } = {}) {
  const target = document.querySelector("#google-auth");
  const status = document.querySelector("#google-auth-status");
  if (!target) return;
  let busy = false;
  try {
    await mountGoogleSignIn(target, {
      text: signup ? "signup_with" : "continue_with",
      onCredential: async (credential) => {
        if (busy) return;
        busy = true;
        target.inert = true;
        if (status)
          status.textContent = signup
            ? "Creating your account with Google…"
            : "Signing you in with Google…";
        try {
          await request("/api/auth/sign-in/google-credential", {
            method: "POST",
            body: JSON.stringify({ credential }),
          });
          sessionCache = undefined;
          await syncAccountButton();
          toast(signup ? "Your Google account is ready." : "Welcome back.");
          onSuccess();
        } catch (error) {
          if (status) status.textContent = error.message;
          target.inert = false;
          busy = false;
        }
      },
    });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function signInPage(main, config, toast) {
  main.innerHTML = authLayout(
    "WELCOME BACK",
    "Continue your<br><em>next chapter.</em>",
    "Sign in to keep consultation requests, quotations and payments in one calm place.",
    `<span class="eyebrow green">TRAVELER SIGN IN</span><h2>Good to see you.</h2><form id="login-form" class="account-form">${field("Email address", "email", "email", 'autocomplete="email" required')}${field("Password", "password", "password", 'autocomplete="current-password" minlength="6" required')}<div class="form-between"><label class="check-row"><input name="rememberMe" type="checkbox" checked> Keep me signed in</label><a href="/account/forgot-password">Forgot password?</a></div><button class="button" type="submit" ${config.auth ? "" : "disabled"}>Sign in securely ↗</button><p class="form-status" role="status"></p></form>${config.google ? '<div class="google-auth-block"><div id="google-auth" class="google-signin-button" aria-label="Continue with Google"></div><p id="google-auth-status" class="form-status" role="status"></p></div>' : ""}<p class="auth-switch">New to KuboVistas? <a href="/account/signup">Create an account</a></p>`,
    config,
  );
  const form = document.querySelector("#login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector(".form-status");
    const button = form.querySelector("button[type=submit]");
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    status.textContent = "Signing you in…";
    try {
      await request("/api/auth/sign-in/email", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          rememberMe: Boolean(values.rememberMe),
          callbackURL: `${location.origin}/dashboard`,
        }),
      });
      sessionCache = undefined;
      await syncAccountButton();
      toast("Welcome back.");
      const params = new URLSearchParams(location.search);
      const next = params.get("return");
      location.hash =
        next &&
        /^\/(dashboard|planner|profile|bookings|booking|payments|settings|security|write|my-stories|journal-review|travel-date)(?:[/?]|$)/.test(
          next,
        )
          ? next
          : "/dashboard";
    } catch (error) {
      status.textContent = error.message;
      button.disabled = !config.auth;
    }
  });
  await setupGoogleAuth(toast, {
    onSuccess: () => {
      const params = new URLSearchParams(location.search);
      const next = params.get("return");
      location.hash =
        next &&
        /^\/(dashboard|planner|profile|bookings|booking|payments|settings|security|write|my-stories|journal-review|travel-date)(?:[/?]|$)/.test(
          next,
        )
          ? next
          : "/dashboard";
    },
  });
}

async function signUpPage(main, config, toast) {
  main.innerHTML = authLayout(
    "CREATE YOUR ACCOUNT",
    "Travel plans.<br><em>One private place.</em>",
    "Build a profile, request a consultation and pay only against a reviewed quotation.",
    `<span class="eyebrow green">NEW TRAVELER</span><h2>Start somewhere.</h2><form id="signup-form" class="account-form">${field("Full name", "name", "text", 'autocomplete="name" maxlength="80" required')}${field("Email address", "email", "email", 'autocomplete="email" required')}${field("Create password", "password", "password", 'autocomplete="new-password" minlength="10" required')}<div class="password-hint"><span>10+ characters</span><span>Use a unique password</span></div><label class="check-row"><input name="terms" type="checkbox" required> I agree to the Terms and acknowledge the Privacy Policy.</label><button class="button" type="submit" ${config.auth ? "" : "disabled"}>Create my account ↗</button><p class="form-status" role="status"></p></form>${config.google ? '<div class="google-auth-block"><div id="google-auth" class="google-signin-button" aria-label="Sign up with Google"></div><p id="google-auth-status" class="form-status" role="status"></p></div>' : ""}<p class="auth-switch">Already have an account? <a href="/account/login">Sign in</a></p>`,
    config,
  );
  const form = document.querySelector("#signup-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const status = form.querySelector(".form-status");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.textContent = "Creating your account…";
    try {
      await request("/api/auth/sign-up/email", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          callbackURL: `${location.origin}/welcome`,
        }),
      });
      sessionCache = undefined;
      if (config.emailVerification) {
        location.hash = `/verify-email?email=${encodeURIComponent(values.email)}`;
      } else {
        await syncAccountButton();
        location.hash = "/welcome";
      }
    } catch (error) {
      status.textContent = error.message;
      button.disabled = !config.auth;
    }
  });
  await setupGoogleAuth(toast, {
    signup: true,
    onSuccess: () => {
      location.hash = "/welcome";
    },
  });
}

async function forgotPage(main, config) {
  main.innerHTML = authLayout(
    "PASSWORD RECOVERY",
    "A small reset.<br><em>Then onward.</em>",
    "Enter the email used for your account. If it exists, we will send a secure reset link.",
    `<span class="eyebrow green">RESET PASSWORD</span><h2>Find your way back.</h2><form id="forgot-form" class="account-form">${field("Email address", "email", "email", 'autocomplete="email" required')}<button class="button" type="submit" ${config.auth ? "" : "disabled"}>Send reset link ↗</button><p class="form-status" role="status"></p></form><p class="auth-switch"><a href="/account/login">← Return to sign in</a></p>`,
    config,
  );
  const form = document.querySelector("#forgot-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector(".form-status");
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const email = new FormData(form).get("email");
      await request("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({
          email,
          redirectTo: `${location.origin}//reset-password`,
        }),
      });
      status.textContent =
        "If an account matches that email, a reset link is on its way.";
    } catch (error) {
      status.textContent = error.message;
      button.disabled = !config.auth;
    }
  });
}

async function resetPage(main, config) {
  const params = new URLSearchParams(location.search);
  const token =
    params.get("oobCode") ||
    params.get("token") ||
    new URLSearchParams(location.search).get("oobCode") ||
    "";
  main.innerHTML = authLayout(
    "NEW PASSWORD",
    "Secure again.<br><em>Ready again.</em>",
    "Choose a fresh password that you do not reuse on another service.",
    `<span class="eyebrow green">PASSWORD RESET</span><h2>Choose a new password.</h2>${token ? `<form id="reset-form" class="account-form">${field("New password", "password", "password", 'autocomplete="new-password" minlength="10" required')}${field("Confirm new password", "confirmPassword", "password", 'autocomplete="new-password" minlength="10" required')}<button class="button" type="submit" ${config.auth ? "" : "disabled"}>Update password ↗</button><p class="form-status" role="status"></p></form>` : '<div class="empty-inline"><h3>This reset link is incomplete.</h3><p>Request a fresh password-reset email to continue.</p><a class="button" href="/account/forgot-password">Request new link</a></div>'}`,
    config,
  );
  const form = document.querySelector("#reset-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const status = form.querySelector(".form-status");
    if (values.password !== values.confirmPassword) {
      status.textContent = "The passwords do not match.";
      return;
    }
    try {
      await request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: values.password, token }),
      });
      status.textContent = "Password updated. You can sign in now.";
      setTimeout(() => {
        location.hash = "/login";
      }, 900);
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

function verifyPage(main, config) {
  const email = new URLSearchParams(location.search).get("email");
  main.innerHTML = authLayout(
    "CHECK YOUR INBOX",
    "One click.<br><em>Then you’re in.</em>",
    "Email verification protects your itinerary, quotation and payment history.",
    `<div class="auth-icon">✦</div><h2>Verify your email.</h2><p class="panel-copy">We sent a verification link${email ? ` to <strong>${escapeHTML(email)}</strong>` : ""}. Open it on this device to continue.</p><button class="button outline" id="resend-verification" ${config.emailVerification && email ? "" : "disabled"}>Send another link</button><p class="form-status" role="status"></p><p class="auth-switch"><a href="/account/login">Return to sign in</a></p>`,
    config,
  );
  document
    .querySelector("#resend-verification")
    ?.addEventListener("click", async (event) => {
      try {
        const resendButton = event.currentTarget;
        resendButton.disabled = true;
        await request("/api/auth/send-verification-email", {
          method: "POST",
          body: JSON.stringify({
            email,
            callbackURL: `${location.origin}//dashboard`,
          }),
        });
        document.querySelector(".form-status").textContent =
          "A fresh verification link has been sent.";
      } catch (error) {
        document.querySelector(".form-status").textContent = error.message;
        document
          .querySelector("#resend-verification")
          ?.removeAttribute("disabled");
      }
    });
}

const accountNav = (active) =>
  `<nav class="account-nav" aria-label="Your account"><a href="/account/dashboard" ${active === "dashboard" ? 'aria-current="page"' : ""}>Overview</a><a href="/account/bookings" ${active === "bookings" ? 'aria-current="page"' : ""}>Trips & quotes</a><a href="/account/payments" ${active === "payments" ? 'aria-current="page"' : ""}>Payments</a><a href="/account/profile" ${active === "profile" ? 'aria-current="page"' : ""}>Profile</a><a href="/account/notifications" ${active === "notifications" ? 'aria-current="page"' : ""}>Updates</a><a href="/account/documents" ${active === "documents" ? 'aria-current="page"' : ""}>Documents</a><a href="/account/settings" ${active === "settings" ? 'aria-current="page"' : ""}>Settings</a><a href="/account/security" ${active === "security" ? 'aria-current="page"' : ""}>Security</a><a href="/account/saved">Saved places</a><a href="/account/support">Support</a><a href="/account/review">Review a trip</a><a href="/account/membership-interest">Membership interest</a><a href="/account/supplier-portal">Supplier portal</a></nav>`;

function shell(main, active, session, title, intro, content) {
  if (
    session.renderVersion !== undefined &&
    main.dataset.routeVersion !== session.renderVersion
  )
    return false;
  main.innerHTML = `<section class="account-page wrap"><div class="account-heading"><div><span class="eyebrow green">YOUR KuboVistas</span><h1>${title}</h1><p>${intro}</p></div><div class="account-identity"><span>${escapeHTML(initials(session.user.name))}</span><div><strong>${escapeHTML(session.user.name)}</strong><small>${escapeHTML(session.user.email)}</small></div></div></div>${accountNav(active)}<div class="account-content">${content}</div></section>`;
  return true;
}

function authRequired(main) {
  main.innerHTML = `<section class="account-required wrap"><span class="eyebrow green">PRIVATE TRAVELER AREA</span><h1>Sign in to keep<br><em>your plans together.</em></h1><p>Your profile, trip requests, quotations and payment history live behind your secure account.</p><div><a class="button" href="/account/login?return=${encodeURIComponent(location.pathname + location.search)}">Sign in ↗</a><a class="button outline" href="/account/signup">Create account</a></div></section>`;
}

function statusPill(status) {
  return `<span class="status-pill status-${escapeHTML(status)}">${escapeHTML(String(status).replaceAll("_", " "))}</span>`;
}

function bookingCard(item) {
  const due = item.quote_total_paise
    ? Math.round(
        (Number(item.quote_total_paise) * Number(item.advance_percent)) / 100,
      )
    : 0;
  return `<a class="booking-card" href="/account/booking/${item.id}"><div><span class="eyebrow green">${date(item.created_at)}</span><h3>${escapeHTML(item.destination_name)}</h3><p>${item.days} days · ${item.travelers} ${item.travelers === 1 ? "traveler" : "travelers"} · ${escapeHTML(item.travel_style)}</p></div><div>${statusPill(item.status)}${due ? `<strong>${money(due)} advance</strong>` : "<strong>Expert review</strong>"}<span>Open trip ↗</span></div></a>`;
}

async function dashboardPage(main, session) {
  const [bookingsData, paymentsData, noticesData] = await Promise.all([
    request("/api/bookings"),
    request("/api/payments"),
    request("/api/notifications"),
  ]);
  const capability = await request("/api/profile");
  const bookings = bookingsData.bookings || [];
  const payments = paymentsData.payments || [];
  const notices = noticesData.notifications || [];
  const next = bookings.find((item) =>
    ["quotation_ready", "advance_paid", "confirmed"].includes(item.status),
  );
  if (
    !shell(
      main,
      "dashboard",
      session,
      `Good to see you,<br><em>${escapeHTML(session.user.name.split(" ")[0])}.</em>`,
      "Your trips, quotations and account details—without the clutter.",
      `${capability.admin ? '<p class="notice"><a href="/company/enquiry-inbox">Business enquiries ↗</a><a class="underlined" href="/account/admin">Quotation management ↗</a><a class="underlined" href="/account/team">Team operations ↗</a><a class="underlined" href="/account/growth">Editorial desk ↗</a></p>' : ""}<section class="account-stats"><div><span>Trip requests</span><strong>${bookings.length}</strong></div><div><span>Active quotation</span><strong>${bookings.filter((item) => item.status === "quotation_ready").length}</strong></div><div><span>Payments</span><strong>${payments.length}</strong></div><div><span>Unread updates</span><strong>${notices.filter((item) => !item.read_at).length}</strong></div></section>${next ? `<section class="next-trip"><div><span class="eyebrow">NEXT IN YOUR STORY</span><h2>${escapeHTML(next.destination_name)}</h2><p>${next.days} thoughtful days · ${next.travelers} travelers</p><a class="button" href="/account/booking/${next.id}">Review this trip ↗</a></div><div>${statusPill(next.status)}<span>${next.departure_date ? date(next.departure_date) : "Dates are flexible"}</span></div></section>` : `<section class="empty-account"><span>↗</span><h2>Your first chapter starts here.</h2><p>Build a trip brief, then send it for a personal consultation.</p><a class="button" href="/planner">Start planning ↗</a></section>`}<section class="ops-quick"><a href="/account/documents">Invoices & vouchers ↗</a><a href="/account/support">Support cases ↗</a><a href="/packages">Explore packages ↗</a></section><section class="account-split"><div><div class="account-section-title"><h2>Recent requests</h2><a href="/account/bookings">View all ↗</a></div>${bookings.slice(0, 3).map(bookingCard).join("") || '<p class="muted-copy">No consultation requests yet.</p>'}</div><aside class="account-updates"><div class="account-section-title"><h2>Updates</h2><a href="/account/notifications">Open all ↗</a></div>${
        notices
          .slice(0, 4)
          .map(
            (item) =>
              `<article class="update-item ${item.read_at ? "" : "unread"}"><span>${escapeHTML(item.kind)}</span><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.message)}</p></article>`,
          )
          .join("") || '<p class="muted-copy">You are all caught up.</p>'
      }</aside></section>`,
    )
  )
    return;
}

async function profilePage(main, session, toast, welcome = false) {
  const data = await request("/api/profile");
  const p = data.profile || {};
  if (
    !shell(
      main,
      "profile",
      session,
      welcome
        ? "Tell us how<br><em>you travel.</em>"
        : "Your traveler<br><em>profile.</em>",
      welcome
        ? "A few details help an expert shape a more thoughtful consultation."
        : "Keep the details used to personalise your consultation current.",
      `<form id="profile-form" class="profile-form"><section><span class="eyebrow green">THE BASICS</span><div class="profile-avatar">${escapeHTML(initials(p.display_name || session.user.name))}</div><div class="form-grid">${field("Display name", "displayName", "text", `value="${escapeHTML(p.display_name || session.user.name)}" maxlength="80" required`)}${field("Phone number", "phone", "tel", `value="${escapeHTML(p.phone || "")}" autocomplete="tel" maxlength="24"`)}</div><div class="form-grid">${field("City", "city", "text", `value="${escapeHTML(p.city || "")}" maxlength="80"`)}${field("State", "state", "text", `value="${escapeHTML(p.state || "")}" maxlength="80"`)}</div>${field("Country", "country", "text", `value="${escapeHTML(p.country || "India")}" maxlength="80"`)}</section><section><span class="eyebrow green">YOUR TRAVEL RHYTHM</span><label>Preferred travel style<select name="travelStyle">${["Slow & scenic", "Culture & connection", "Nature & walking", "Friends & adventure", "Family time"].map((style) => `<option ${p.travel_style === style ? "selected" : ""}>${style}</option>`).join("")}</select></label><label>A little about you<textarea name="bio" maxlength="400" placeholder="The places, pace or experiences you enjoy…">${escapeHTML(p.bio || "")}</textarea></label><label>Accessibility or support notes <span class="optional">Optional</span><textarea name="accessibilityNotes" maxlength="500" placeholder="Share only what helps us plan a more comfortable trip.">${escapeHTML(p.accessibility_notes || "")}</textarea></label></section><section><span class="eyebrow green">EMERGENCY CONTACT · OPTIONAL</span><p class="field-note">Add this only when useful for a consultation. It is personal data and should be kept accurate.</p><div class="form-grid">${field("Contact name", "emergencyContactName", "text", `value="${escapeHTML(p.emergency_contact_name || "")}" maxlength="100"`)}${field("Contact phone", "emergencyContactPhone", "tel", `value="${escapeHTML(p.emergency_contact_phone || "")}" maxlength="24"`)}</div></section><div class="sticky-form-action"><p class="form-status" role="status"></p><button class="button" type="submit">Save profile ↗</button></div></form>`,
    )
  )
    return;
  const form = document.querySelector("#profile-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const status = form.querySelector(".form-status");
    status.textContent = "Saving…";
    try {
      await request("/api/profile", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      sessionCache = undefined;
      await syncAccountButton();
      toast("Your profile has been updated.");
      if (welcome) location.hash = "/dashboard";
      else status.textContent = "Saved.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function settingsPage(main, session, toast) {
  const { settings: s } = await request("/api/settings");
  if (
    !shell(
      main,
      "settings",
      session,
      "Settings that<br><em>feel like you.</em>",
      "Choose how KuboVistas communicates and how your traveler profile behaves.",
      `<form id="settings-form" class="settings-form"><section><span class="eyebrow green">COMMUNICATION</span>${[
        [
          "emailTripUpdates",
          "Trip and quotation updates",
          "Essential progress messages about requests and payments.",
          s.email_trip_updates,
        ],
        [
          "emailOffers",
          "Destination inspiration",
          "Occasional guides and offers. Off by default.",
          s.email_offers,
        ],
        [
          "productUpdates",
          "Product updates",
          "Important changes to KuboVistas features.",
          s.product_updates,
        ],
      ]
        .map(
          ([name, title, copy, checked]) =>
            `<label class="setting-row"><span><strong>${title}</strong><small>${copy}</small></span><input type="checkbox" name="${name}" ${checked ? "checked" : ""}></label>`,
        )
        .join(
          "",
        )}</section><section><span class="eyebrow green">PRIVACY & PREFERENCES</span><label>Profile visibility<select name="profileVisibility"><option value="private" ${s.profile_visibility === "private" ? "selected" : ""}>Private</option><option value="companions" ${s.profile_visibility === "companions" ? "selected" : ""}>Visible to approved trip companions</option></select></label><div class="form-grid"><label>Preferred language<select name="preferredLanguage">${["English", "বাংলা", "हिन्दी"].map((v) => `<option ${s.preferred_language === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Currency<select name="preferredCurrency"><option>INR</option></select></label></div><a class="underlined" href="/legal/privacy">Read the Privacy Policy ↗</a></section><div class="sticky-form-action"><p class="form-status" role="status"></p><button class="button" type="submit">Save settings ↗</button></div></form>`,
    )
  )
    return;
  const form = document.querySelector("#settings-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const payload = {
      emailTripUpdates: fd.has("emailTripUpdates"),
      emailOffers: fd.has("emailOffers"),
      productUpdates: fd.has("productUpdates"),
      profileVisibility: fd.get("profileVisibility"),
      preferredLanguage: fd.get("preferredLanguage"),
      preferredCurrency: fd.get("preferredCurrency"),
    };
    const status = form.querySelector(".form-status");
    status.textContent = "Saving…";
    try {
      await request("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      status.textContent = "Saved.";
      toast("Your settings have been updated.");
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function bookingsPage(main, session) {
  const { bookings } = await request("/api/bookings");
  if (
    !shell(
      main,
      "bookings",
      session,
      "Trips, quotes<br><em>& possibilities.</em>",
      "Follow every consultation request from first idea to confirmed journey.",
      `<div class="account-toolbar"><span>${bookings.length} ${bookings.length === 1 ? "trip request" : "trip requests"}</span><a class="button small" href="/planner">Plan another trip ↗</a></div><div class="booking-list">${bookings.map(bookingCard).join("") || '<section class="empty-account"><span>◇</span><h2>No trip requests yet.</h2><p>Create a personal trip brief and send it for expert review.</p><a class="button" href="/planner">Build a trip brief ↗</a></section>'}</div>`,
    )
  )
    return;
}

async function bookingDetailPage(main, session, id) {
  const [{ booking: b }, config] = await Promise.all([
    request(`/api/bookings?id=${encodeURIComponent(id)}`),
    getConfig(),
  ]);
  const due = b.quote_total_paise
    ? Math.round(
        (Number(b.quote_total_paise) * Number(b.advance_percent)) / 100,
      )
    : 0;
  if (
    !shell(
      main,
      "bookings",
      session,
      `${escapeHTML(b.destination_name)}<br><em>in the making.</em>`,
      "Your consultation request, quotation and next action in one place.",
      `<a class="back-link" href="/account/bookings">← All trips & quotations</a><div class="booking-detail"><section><div class="booking-detail-head"><div><span class="eyebrow green">REQUEST ${escapeHTML(b.id.slice(0, 8).toUpperCase())}</span><h2>${escapeHTML(b.destination_name)}</h2></div>${statusPill(b.status)}</div><dl class="detail-list"><div><dt>Duration</dt><dd>${b.days} days</dd></div><div><dt>Travelers</dt><dd>${b.travelers}</dd></div><div><dt>Travel style</dt><dd>${escapeHTML(b.travel_style)}</dd></div><div><dt>Preferred departure</dt><dd>${date(b.departure_date)}</dd></div><div><dt>Your budget target</dt><dd>${money(Number(b.budget_per_person_paise) * b.travelers)}</dd></div><div><dt>Requested</dt><dd>${date(b.created_at)}</dd></div></dl>${b.notes ? `<div class="traveler-note"><span>YOUR NOTE</span><p>${escapeHTML(b.notes)}</p></div>` : ""}</section><aside class="quote-card ${b.status === "quotation_ready" ? "ready" : ""}"><span class="eyebrow">${b.quote_total_paise ? "YOUR QUOTATION" : "EXPERT REVIEW"}</span>${b.quote_total_paise ? `<h2>${money(b.quote_total_paise)}</h2><p>Total quoted trip price for the confirmed scope.</p><dl><div><dt>Advance</dt><dd>${b.advance_percent}%</dd></div><div><dt>Due now</dt><dd>${money(due)}</dd></div><div><dt>Valid until</dt><dd>${date(b.quote_expires_at)}</dd></div></dl>${b.quote_notes ? `<p class="quote-note">${escapeHTML(b.quote_notes)}</p>` : ""}${b.status === "quotation_ready" ? (config.payments ? `<a class="button" href="/account/checkout/${b.id}">Pay secure advance ↗</a>` : `<div class="setup-notice"><strong>Secure payment is temporarily unavailable</strong><p>Your quotation remains visible. Please do not send money outside its approved payment instructions.</p></div>`) : `<a class="button outline" href="/account/payments">View payment record</a>`}` : `<h2>We’re shaping the details.</h2><p>A travel expert will review your dates, pace and budget before sharing an itemised quotation. No payment is requested yet.</p><div class="quote-steps"><span class="done">Request received</span><span>Expert consultation</span><span>Quotation ready</span><span>Secure advance</span></div>`}<small>Payments are requested only against a reviewed quotation.</small></aside></div>`,
    )
  )
    return;
  mountBookingActions(main, b);
  const weatherHost = document.createElement("div");
  main.querySelector(".account-content")?.append(weatherHost);
  if (!weatherHost.isConnected) main.append(weatherHost);
  mountWeather(
    weatherHost,
    b.destination_id,
    b.departure_date
      ? new Date(b.departure_date).toISOString().slice(0, 10)
      : "",
  );
}

async function paymentsPage(main, session) {
  const { payments } = await request("/api/payments");
  if (
    !shell(
      main,
      "payments",
      session,
      "Payments,<br><em>clearly recorded.</em>",
      "Every secure advance linked to its quotation and trip request.",
      `<div class="payment-list">${payments.map((p) => `<article class="payment-row"><div><span class="eyebrow green">${date(p.created_at)}</span><h3>${escapeHTML(p.destination_name)}</h3><p>Order ${escapeHTML(p.razorpay_order_id)} · ${escapeHTML(p.purpose || "deposit")}</p>${Number(p.refunded_amount_paise) > 0 ? `<p>Refund processed: ${money(p.refunded_amount_paise)}</p>` : ""}</div><div>${statusPill(p.status)}<strong>${money(p.amount_paise)}</strong><small>${p.razorpay_payment_id ? `Payment ${escapeHTML(p.razorpay_payment_id)}` : "Awaiting payment"}</small></div></article>`).join("") || '<section class="empty-account"><span>₹</span><h2>No payments yet.</h2><p>You will only see a payment request after an expert shares a valid quotation.</p><a class="button" href="/account/bookings">View trip requests ↗</a></section>'}</div><div class="payment-assurance"><strong>Secure by design</strong><p>Card, UPI and banking credentials are entered in Razorpay Checkout—not stored by KuboVistas. Order amounts are calculated on the server from your accepted quotation.</p><a href="/legal/cancellation">Cancellation & refund policy ↗</a></div>`,
    )
  )
    return;
}

async function notificationsPage(main, session, toast) {
  const { notifications } = await request("/api/notifications");
  if (
    !shell(
      main,
      "notifications",
      session,
      "The latest from<br><em>your journey.</em>",
      "Consultation, quotation, payment and account updates.",
      `<div class="account-toolbar"><span>${notifications.filter((n) => !n.read_at).length} unread</span>${notifications.length ? '<button class="text-button" id="read-all">Mark all as read</button>' : ""}</div><div class="notification-list">${notifications.map((n) => `<button class="notification-card ${n.read_at ? "" : "unread"}" data-notification="${n.id}"><span class="notification-mark"></span><div><small>${escapeHTML(n.kind)} · ${date(n.created_at)}</small><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.message)}</p></div></button>`).join("") || '<section class="empty-account"><span>✓</span><h2>You’re all caught up.</h2><p>New trip and account updates will appear here.</p></section>'}</div>`,
    )
  )
    return;
  const controls = document.createElement("section");
  controls.className = "quote-card";
  controls.innerHTML =
    '<h2>Booking push notifications</h2><p>Enable updates for this account on this browser. Lock-screen messages contain a generic alert; sign in to read the details. If this browser has lost its device token, disabling clears all devices for your account.</p><button class="button" data-enable-push>Enable on this browser</button> <button class="button outline" data-disable-push>Disable push</button><p role="status" aria-live="polite"></p>';
  main.querySelector(".account-content").prepend(controls);
  for (const [selector, fn, message] of [
    ["[data-enable-push]", enableBookingPush, "Booking notifications enabled."],
    ["[data-disable-push]", disableBookingPush, "Push notifications disabled."],
  ])
    controls.querySelector(selector).onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await fn();
        controls.querySelector("[role=status]").textContent = message;
      } catch (error) {
        controls.querySelector("[role=status]").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  document.querySelector("#read-all")?.addEventListener("click", async () => {
    await request("/api/notifications", { method: "PATCH", body: "{}" });
    toast("All updates marked as read.");
    notificationsPage(main, session, toast);
  });
  document.querySelectorAll("[data-notification]").forEach((button) =>
    button.addEventListener("click", async () => {
      await request("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id: button.dataset.notification }),
      });
      button.classList.remove("unread");
    }),
  );
}

async function securityPage(main, session, toast) {
  if (
    !shell(
      main,
      "security",
      session,
      "Account security,<br><em>in your hands.</em>",
      "Firebase protects your sign-in. Sensitive changes require a recent sign-in.",
      `<div class="security-grid"><section><h2>Change password</h2><p>For email/password accounts. Google accounts manage passwords in Google.</p><form id="password-form" class="account-form">${field("Current password", "currentPassword", "password", "required")}${field("New password", "newPassword", "password", 'minlength="10" required')}<label><input name="revoke" type="checkbox" checked> Sign out all devices after changing password</label><button class="button">Update password</button><p role="status"></p></form></section><section><h2>Devices</h2><p>Firebase does not expose a browser session list here. You can revoke all account sessions.</p><form id="revoke-form" class="account-form">${field("Password (leave blank for Google reauthentication)", "password", "password")}<button class="button outline">Sign out all devices</button><p role="status"></p></form><button class="button outline" id="signout-account">Sign out this device</button></section><section><h2>Delete account</h2><p>Accounts with payment records need support-assisted closure. Otherwise this removes your Firebase identity and local profile. Google users confirm through a popup.</p><form id="delete-form" class="account-form">${field("Password (leave blank for Google reauthentication)", "password", "password")}${field("Type DELETE", "confirmation", "text", 'pattern="DELETE" required')}<button class="button outline">Delete my account</button><p role="status"></p></form></section></div>`,
    )
  )
    return;
  for (const [id, action] of [
    ["password-form", "change-password"],
    ["revoke-form", "revoke-sessions"],
    ["delete-form", "delete-user"],
  ]) {
    const form = main.querySelector("#" + id);
    form.onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        if (action === "delete-user" && values.confirmation !== "DELETE")
          throw Error("Type DELETE exactly.");
        await request("/api/auth/" + action, {
          method: "POST",
          body: JSON.stringify({
            ...values,
            revokeOtherSessions: Boolean(values.revoke),
          }),
        });
        form.querySelector("[role=status]").textContent = "Account updated.";
        if (action === "delete-user") {
          sessionCache = null;
          location.hash = "/";
        }
      } catch (error) {
        form.querySelector("[role=status]").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  main.querySelector("#signout-account").onclick = () => signOut(toast);
}

async function checkoutPage(main, session, id, toast) {
  const [config, { booking: b }] = await Promise.all([
    getConfig(),
    request(`/api/bookings?id=${encodeURIComponent(id)}`),
  ]);
  const purpose =
    new URLSearchParams(location.search).get("purpose") === "balance"
      ? "balance"
      : "deposit";
  const deposit = b.quote_total_paise
    ? Math.round(
        (Number(b.quote_total_paise) * Number(b.advance_percent)) / 100,
      )
    : 0;
  const due =
    purpose === "balance" ? Number(b.quote_total_paise) - deposit : deposit;
  const canPay =
    !b.cancellation_requested_at &&
    (purpose === "balance"
      ? b.payment_policy_version === 2 &&
        !!b.checked_in_at &&
        !b.balance_paid_at
      : b.status === "quotation_ready");
  const unavailable = !config.payments
    ? "Online payment is temporarily unavailable."
    : !canPay
      ? "This booking is not currently eligible for this payment."
      : "";
  if (
    !shell(
      main,
      "payments",
      session,
      purpose === "balance"
        ? "Your check-in.<br><em>Your remaining balance.</em>"
        : "Secure<br><em>booking deposit.</em>",
      "Review the quotation summary before opening Razorpay Checkout.",
      `<a class="back-link" href="/account/booking/${encodeURIComponent(b.id)}">← Back to quotation</a><div class="checkout-layout"><section class="checkout-summary"><span class="eyebrow green">QUOTATION SUMMARY</span><h2>${escapeHTML(b.destination_name)}</h2><p>Quotation version ${Number(b.current_quote_version) || "legacy"}</p><dl><div><dt>Trip total</dt><dd>${money(b.quote_total_paise)}</dd></div><div><dt>Booking deposit percentage</dt><dd>${b.advance_percent}%</dd></div><div class="checkout-due"><dt>${purpose === "balance" ? "Balance after check-in" : "Deposit due now"}</dt><dd>${money(due)}</dd></div><div><dt>Remaining after this payment</dt><dd>${money(purpose === "balance" ? 0 : Number(b.quote_total_paise) - due)}</dd></div></dl>${b.quote_notes ? `<p>${escapeHTML(b.quote_notes)}</p>` : ""}${policyMarkup(b)}<label class="check-row"><input id="accept-payment-terms" type="checkbox" ${config.payments && canPay ? "" : "disabled"}> I reviewed the quotation and accept its cancellation terms.</label><button class="button" id="pay-advance" ${config.payments && canPay ? "" : "disabled"}>Pay ${money(due)} securely ↗</button><p class="form-status" role="status">${escapeHTML(unavailable)}</p></section><aside class="checkout-trust"><span>SECURE CHECKOUT${config.paymentMode === "test" ? " · TEST MODE" : ""}</span><h2>Your payment details stay with Razorpay.</h2><ul><li>Order amount generated by the KuboVistas server</li><li>Checkout signature verified after payment</li><li>Final status confirmed through a signed webhook</li><li>No card or UPI credentials stored by KuboVistas</li></ul>${!config.payments ? '<div class="setup-notice"><strong>Payments are unavailable</strong><p>Your quotation is preserved. Contact support if you need help; do not make an untracked transfer.</p></div>' : ""}${config.paymentMode === "test" ? '<div class="setup-notice"><strong>Test checkout</strong><p>No real booking or entitlement is created by test money.</p></div>' : ""}<a href="/legal/cancellation">Cancellation & refund policy ↗</a></aside></div>`,
    )
  )
    return;
  document
    .querySelector("#pay-advance")
    .addEventListener("click", async (event) => {
      const terms = document.querySelector("#accept-payment-terms");
      const status = document.querySelector(".form-status");
      if (!terms.checked) {
        status.textContent =
          "Please review and accept the quotation terms first.";
        return;
      }
      const payButton = event.currentTarget;
      payButton.disabled = true;
      status.textContent = "Preparing secure checkout…";
      try {
        const order = await request("/api/payments/create-order", {
          method: "POST",
          body: JSON.stringify({
            bookingId: b.id,
            purpose,
            acceptTerms: true,
            quoteUpdatedAt: b.updated_at,
          }),
        });
        await loadRazorpay();
        const checkout = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "KuboVistas",
          description: `${purpose === "balance" ? "Balance" : "Deposit"} for ${order.booking.destination}`,
          order_id: order.orderId,
          prefill: order.customer,
          theme: { color: "#cde77f" },
          modal: {
            ondismiss: () => {
              status.textContent =
                "Checkout closed. No payment status was changed.";
              document
                .querySelector("#pay-advance")
                ?.removeAttribute("disabled");
            },
          },
          handler: async (response) => {
            status.textContent = "Verifying payment…";
            try {
              const verified = await request("/api/payments/verify", {
                method: "POST",
                body: JSON.stringify(response),
              });
              location.hash = verified.captured
                ? `/thank-you/${b.id}`
                : `/payment/pending?booking=${b.id}`;
            } catch (error) {
              location.hash = `/payment/pending?booking=${b.id}&reason=${encodeURIComponent(error.message)}`;
            }
          },
        });
        checkout.on("payment.failed", (response) => {
          location.hash = `/payment/failed?booking=${b.id}&reason=${encodeURIComponent(response.error?.description || "Payment failed")}`;
        });
        checkout.open();
      } catch (error) {
        status.textContent = error.message;
        document.querySelector("#pay-advance")?.removeAttribute("disabled");
        toast(error.message);
      }
    });
}

let razorpayLoading;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoading) return razorpayLoading;
  razorpayLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      razorpayLoading = null;
      reject(
        new Error("Secure checkout could not be loaded. Please try again."),
      );
    };
    const timer = setTimeout(fail, 20000);
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (!window.Razorpay) return fail();
      clearTimeout(timer);
      resolve();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return razorpayLoading;
}

async function paymentResultPage(main, session, state) {
  const params = new URLSearchParams(location.search);
  const booking = params.get("booking");
  const { payments } = await request("/api/payments");
  const payment = payments.find((p) => p.booking_id === booking);
  state =
    payment?.status === "captured"
      ? "success"
      : ["authorized", "created"].includes(payment?.status) ||
          state === "pending"
        ? "pending"
        : "failed";
  const failed = state === "failed";
  const pending = state === "pending";
  if (
    !shell(
      main,
      "payments",
      session,
      failed
        ? "Payment not completed."
        : pending
          ? "Payment status<br><em>Confirmation pending.</em>"
          : "Advance received.<br><em>Your trip moves forward.</em>",
      failed
        ? "No successful charge was confirmed. You can return to the quotation and try again."
        : pending
          ? "The final payment status has not been confirmed yet. Check payment history before retrying."
          : "Your payment was captured and linked to the quotation.",
      `<section class="payment-result ${failed ? "failed" : pending ? "pending" : "success"}"><span>${failed ? "×" : pending ? "…" : "✓"}</span><h2>${failed ? "Let’s try that again." : pending ? "We’re confirming it." : "Payment successful."}</h2><p>${failed ? escapeHTML(params.get("reason") || "The payment provider did not confirm the transaction.") : pending ? "Do not pay again. Refresh the payment history shortly; the signed webhook will update the final status." : "A payment record is available in your account. Final booking confirmation follows after the travel team completes supplier checks."}</p><div><a class="button" href="${booking ? `/booking/${encodeURIComponent(booking)}` : "/bookings"}">Back to trip ↗</a><a class="button outline" href="/account/payments">Payment history</a></div></section>`,
    )
  )
    return;
}

async function signOut(toast) {
  try {
    await request("/api/auth/sign-out", { method: "POST", body: "{}" });
    sessionCache = null;
    await syncAccountButton();
    toast("You have been signed out.");
    location.hash = "/";
  } catch (error) {
    toast(error.message);
  }
}

export async function createConsultation(plan) {
  const session = await getAccountSession(true);
  if (!session?.user) {
    location.hash = "/login?return=/planner";
    return { redirected: true };
  }
  const payload = {
    destination: plan.destination,
    days: plan.days,
    travelers: plan.travelers,
    style: plan.style,
    date: plan.date,
    budget: plan.budget,
    notes: plan.notes || "",
    itinerary: plan.itinerary || [],
  };
  const { booking } = await request("/api/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  location.hash = `/booking/${booking.id}`;
  return { booking };
}

export const accountRoutes = new Set([
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "verify-email",
  "welcome",
  "dashboard",
  "profile",
  "settings",
  "security",
  "bookings",
  "booking",
  "payments",
  "notifications",
  "checkout",
  "payment",
  "confirmation",
  "thank-you",
  "cancellation-request",
  "admin",
  "saved",
  "support",
  "case",
  "documents",
  "document",
  "team",
  "growth",
  "review",
  "supplier-portal",
  "membership-interest",
]);

export async function renderAccountRoute(route, id, main, toast) {
  const version = main.dataset.routeVersion;
  const config = await getConfig();
  if (main.dataset.routeVersion !== version) return;
  if (route === "login") return signInPage(main, config, toast);
  if (route === "signup") return signUpPage(main, config, toast);
  if (route === "forgot-password") return forgotPage(main, config);
  if (route === "reset-password") return resetPage(main, config);
  if (route === "verify-email") return verifyPage(main, config);
  const resolvedSession = await getAccountSession(true);
  if (main.dataset.routeVersion !== version) return;
  const session = resolvedSession
    ? { ...resolvedSession, renderVersion: version }
    : null;
  if (!session?.user) {
    authRequired(main);
    return;
  }
  if (route === "admin") return adminPage(main, session, toast);
  if (
    ["growth", "review", "supplier-portal", "membership-interest"].includes(
      route,
    )
  )
    return renderGrowthPrivate(route, main, session);
  if (route === "team") return teamPage(main, session, toast);
  if (route === "documents") return documentsPage(main, session);
  if (route === "document") return documentsPage(main, session, id);
  if (route === "case") return supportPage(main, session, toast, id);
  if (route === "saved") {
    location.hash = "/destinations?saved=true";
    return;
  }
  if (route === "support") return supportPage(main, session, toast);
  if (route === "welcome") return profilePage(main, session, toast, true);
  if (route === "dashboard") return dashboardPage(main, session);
  if (route === "profile") return profilePage(main, session, toast);
  if (route === "settings") return settingsPage(main, session, toast);
  if (route === "security") return securityPage(main, session, toast);
  if (route === "bookings") return bookingsPage(main, session);
  if (route === "booking") return bookingDetailPage(main, session, id);
  if (route === "payments") return paymentsPage(main, session);
  if (route === "notifications") return notificationsPage(main, session, toast);
  if (["confirmation", "thank-you", "cancellation-request"].includes(route))
    return bookingFlowPage(route, id, main);
  if (route === "checkout") return checkoutPage(main, session, id, toast);
  if (route === "payment")
    return paymentResultPage(main, session, id || "failed");
}

const ops = (action, options = {}) =>
  request(
    "/api/config?service=operations&action=" + encodeURIComponent(action),
    options,
  );
async function supportPage(main, session, toast, id) {
  if (id) {
    const data = await request(
      "/api/config?service=operations&action=case&id=" + encodeURIComponent(id),
    );
    const c = data.case;
    if (
      !shell(
        main,
        "support",
        session,
        escapeHTML(c.subject),
        "A private conversation with the travel team.",
        `<a href="/account/support">← Support cases</a><div class="ops-messages">${data.messages.map((m) => `<article class="ops-message"><small>${m.internal ? "Internal note · " : ""}${date(m.created_at)}</small><p>${escapeHTML(m.body)}</p></article>`).join("")}</div><form class="account-form" id="case-reply"><label>Your reply<textarea name="message" minlength="2" maxlength="5000" required></textarea></label><button class="button">Send reply</button><p role="status"></p></form>`,
      )
    )
      return;
    main.querySelector("#case-reply").onsubmit = async (event) => {
      event.preventDefault();
      try {
        await ops("reply", {
          method: "POST",
          body: JSON.stringify({
            action: "reply",
            id,
            message: new FormData(event.currentTarget).get("message"),
          }),
        });
        await supportPage(main, session, toast, id);
      } catch (e) {
        main.querySelector("#case-reply [role=status]").textContent = e.message;
      }
    };
    return;
  }
  const { cases } = await ops("cases");
  const { bookings } = await request("/api/bookings");
  if (
    !shell(
      main,
      "support",
      session,
      "Support for<br><em>your journey.</em>",
      "Raise a private case and track every reply.",
      `<div class="ops-grid"><section><h2>Your cases</h2>${cases.map((c) => `<a class="ops-row" href="/account/case/${c.id}"><strong>${escapeHTML(c.subject)}</strong>${statusPill(c.status)}<small>${date(c.updated_at)}</small></a>`).join("") || "<p>No cases yet.</p>"}</section><form class="account-form" id="support-new"><h2>Open a case</h2><label>Subject<input name="subject" minlength="5" maxlength="160" required></label><label>Category<select name="category"><option value="booking">Booking</option><option value="payment">Payment</option><option value="refund">Refund</option><option value="other">Other</option></select></label><label>Booking (optional)<select name="bookingId"><option value="">General question</option>${bookings.map((b) => `<option value="${b.id}">${escapeHTML(b.destination_name)} · ${b.id.slice(0, 8)}</option>`).join("")}</select></label><label>Message<textarea name="message" minlength="10" maxlength="5000" required></textarea></label><button class="button">Send to support</button><p role="status"></p></form></div><a href="/legal/grievance">Grievance information ↗</a>`,
    )
  )
    return;
  main.querySelector("#support-new").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await ops("open_case", {
        method: "POST",
        body: JSON.stringify({
          action: "open_case",
          ...Object.fromEntries(new FormData(form)),
        }),
      });
      location.href = "/account/case/" + result.case.id;
    } catch (e) {
      form.querySelector("[role=status]").textContent = e.message;
    }
  };
}
async function documentsPage(main, session, id) {
  if (id) {
    const { document: d } = await request(
      "/api/config?service=operations&action=document&id=" +
        encodeURIComponent(id),
    );
    const s = d.snapshot;
    if (
      !shell(
        main,
        "bookings",
        session,
        `${d.kind === "invoice" ? "Invoice" : "Travel voucher"}<br><em>${escapeHTML(d.document_number)}</em>`,
        "Issued document · print or save as PDF from your browser.",
        `<article class="ops-document"><div><strong>${escapeHTML(s.seller)}</strong><p>${escapeHTML(s.address)}</p><p>${escapeHTML(s.taxDisclosure)}</p></div><h2>${d.kind === "invoice" ? "Invoice" : "Travel voucher"} ${escapeHTML(d.document_number)}</h2><dl><div><dt>Traveler</dt><dd>${escapeHTML(s.traveler)}</dd></div><div><dt>Destination</dt><dd>${escapeHTML(s.destination)}</dd></div><div><dt>Travelers</dt><dd>${Number(s.travelers)}</dd></div><div><dt>Booking reference</dt><dd>${escapeHTML(s.bookingId)}</dd></div><div><dt>Quoted total</dt><dd>${money(s.totalPaise)}</dd></div><div><dt>Captured payments</dt><dd>${money(s.paidPaise)}</dd></div></dl>${d.kind === "voucher" ? `<h3>Confirmed suppliers</h3>${(s.suppliers || []).map((x) => `<p>${escapeHTML(x.name)} · ${escapeHTML(x.confirmation_reference)} · ${escapeHTML(x.location)}</p>`).join("")}` : ""}<p>Issued ${date(d.issued_at)}. For changes, contact support with the document number.</p><button class="button" type="button" id="print-document">Print / Save PDF</button></article>`,
      )
    )
      return;
    main.querySelector("#print-document").onclick = () => window.print();
    return;
  }
  const { documents } = await ops("documents");
  shell(
    main,
    "bookings",
    session,
    "Your travel<br><em>documents.</em>",
    "Issued invoices and supplier confirmed vouchers are kept with your booking.",
    `<div class="ops-grid">${documents.map((d) => `<a class="ops-row" href="/account/document/${d.id}"><strong>${escapeHTML(d.kind)} · ${escapeHTML(d.document_number)}</strong><small>${date(d.issued_at)}</small></a>`).join("") || '<section class="empty-account"><h2>No documents yet.</h2><p>Your team issues them after payment and supplier checks.</p></section>'}</div>`,
  );
}
async function teamPage(main, session, toast) {
  const [{ suppliers }, { bookings }, { cases }, { assignments }] =
    await Promise.all([
      ops("suppliers"),
      request("/api/admin/quote"),
      ops("cases"),
      ops("assignments"),
    ]);
  if (
    !shell(
      main,
      "admin",
      session,
      "Operations,<br><em>in one place.</em>",
      "Verified supplier assignments, support cases and issued documents.",
      `<div class="ops-grid"><section><h2>Support queue</h2>${cases.map((c) => `<article class="ops-row"><a href="/account/case/${c.id}">${escapeHTML(c.subject)}</a> ${statusPill(c.status)}<button data-resolve="${c.id}" type="button">Mark resolved</button></article>`).join("") || "<p>No cases.</p>"}</section><section><h2>Suppliers</h2>${suppliers.map((s) => `<article class="ops-row"><strong>${escapeHTML(s.name)}</strong> · ${escapeHTML(s.kind)} ${statusPill(s.status)}<small>${escapeHTML(s.location)}</small>${s.status === "review" ? `<button type="button" data-approve="${s.id}">Approve after verification</button>` : ""}</article>`).join("") || "<p>No suppliers yet.</p>"}</section></div><section class="ops-grid"><div><h2>Supplier responses</h2>${assignments.map((a) => `<article class="ops-row"><strong>${escapeHTML(a.supplier_name)}</strong> · ${escapeHTML(a.destination_name)} ${statusPill(a.supplier_response)}<small>${escapeHTML(a.confirmation_reference)}</small></article>`).join("") || "<p>No assignments yet.</p>"}</div></section><div class="ops-grid"><form class="account-form" id="supplier-form"><h2>Add supplier for review</h2><label>Name<input name="name" required minlength="2"></label><label>Type<select name="kind"><option value="stay">Stay</option><option value="guide">Guide</option><option value="transport">Transport</option><option value="activity">Activity</option></select></label><label>Location<input name="location" maxlength="140"></label><label>Contact email<input name="email" type="email"></label><label>Contact phone<input name="phone" type="tel"></label><label>Notes<textarea name="notes" maxlength="1000"></textarea></label><button class="button">Save supplier</button><p role="status"></p></form><form class="account-form" id="assignment-form"><h2>Record supplier confirmation</h2><label>Confirmed booking<select name="bookingId">${bookings
        .filter((b) => b.confirmed_at)
        .map(
          (b) =>
            `<option value="${b.id}">${escapeHTML(b.destination_name)} · ${b.id.slice(0, 8)}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Approved supplier<select name="supplierId">${suppliers
        .filter((s) => s.status === "approved")
        .map((s) => `<option value="${s.id}">${escapeHTML(s.name)}</option>`)
        .join(
          "",
        )}</select></label><label>Supplier confirmation reference<input name="reference" required minlength="3"></label><button class="button">Record confirmation</button><p role="status"></p></form></div><form class="account-form" id="document-form"><h2>Issue a verified document</h2><label>Booking<select name="bookingId">${bookings
        .filter((b) => b.confirmed_at)
        .map(
          (b) =>
            `<option value="${b.id}">${escapeHTML(b.destination_name)} · ${b.id.slice(0, 8)}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Document<select name="kind"><option value="voucher">Travel voucher</option><option value="invoice">Final invoice</option></select></label><p>Invoices require captured full payment and verified seller/tax details. Vouchers require an approved supplier confirmation.</p><button class="button">Issue document</button><p role="status"></p></form>`,
    )
  )
    return;
  for (const [selector, action] of [
    ["#supplier-form", "supplier"],
    ["#assignment-form", "assign_supplier"],
    ["#document-form", "issue_document"],
  ])
    main.querySelector(selector).onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      try {
        await ops(action, {
          method: "POST",
          body: JSON.stringify({
            action,
            ...Object.fromEntries(new FormData(form)),
          }),
        });
        toast("Record saved.");
        await teamPage(main, session, toast);
      } catch (error) {
        form.querySelector("[role=status]").textContent = error.message;
      }
    };
  main.querySelectorAll("[data-approve]").forEach(
    (button) =>
      (button.onclick = async () => {
        const supplier = suppliers.find((x) => x.id === button.dataset.approve);
        if (!supplier) return;
        try {
          await ops("supplier", {
            method: "POST",
            body: JSON.stringify({
              action: "supplier",
              id: supplier.id,
              name: supplier.name,
              kind: supplier.kind,
              email: supplier.contact_email,
              phone: supplier.contact_phone,
              location: supplier.location,
              notes: supplier.notes,
              status: "approved",
            }),
          });
          await teamPage(main, session, toast);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  main.querySelectorAll("[data-resolve]").forEach(
    (button) =>
      (button.onclick = async () => {
        try {
          await ops("case_status", {
            method: "POST",
            body: JSON.stringify({
              action: "case_status",
              id: button.dataset.resolve,
              status: "resolved",
            }),
          });
          await teamPage(main, session, toast);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}

async function adminPage(main, session, toast) {
  const { bookings } = await request("/api/admin/quote");
  if (
    !shell(
      main,
      "admin",
      session,
      "Review requests.<br><em>Prepare quotations.</em>",
      "Only server-authorized administrators can issue quotations.",
      `<div class="booking-list">${bookings.map((b) => `<article class="booking-card"><div><h3>${escapeHTML(b.destination_name)}</h3><p>${escapeHTML(b.name)} · ${escapeHTML(b.email)} · ${b.days} days · ${b.travelers} travelers</p><small>${escapeHTML(b.id)}</small></div>${statusPill(b.status)}<div>${b.cancellation_requested_at ? `<p>Cancellation deduction ${money(b.cancellation_fee_paise)} · Refundable ${money(b.cancellation_refund_paise)}. Reconcile and process the recorded refund through the operator controls.</p><button class="button small" data-reconcile="${b.id}">Reconcile payments</button>${Number(b.cancellation_refund_paise) > 0 ? `<button class="button small" data-refund="${b.id}">Process refund</button>` : ""}` : ["advance_paid", "confirmed"].includes(b.status) ? `<button class="button small" data-trip-action="${b.confirmed_at ? "checkin" : "confirm"}" data-booking="${b.id}" ${b.checked_in_at ? "disabled" : ""}>${b.checked_in_at ? "Checked in" : b.confirmed_at ? "Record check-in" : "Confirm supplier booking"}</button>` : ""}</div></article>`).join("")}</div><form id="quote-form" class="account-form quote-card"><h2>Issue a quotation</h2><label>Trip request<select name="bookingId" required>${bookings
        .filter((b) =>
          [
            "consultation_requested",
            "consultation_scheduled",
            "quotation_ready",
          ].includes(b.status),
        )
        .map(
          (b) =>
            `<option value="${b.id}">${escapeHTML(b.destination_name)} — ${escapeHTML(b.name)} (${b.id.slice(0, 8)})</option>`,
        )
        .join(
          "",
        )}</select></label>${field("Total amount (INR, including taxes)", "totalAmount", "number", 'min="1" max="10000000" step="0.01" required')}<p>Payment schedule: 20% booking deposit; 80% after verified check-in.</p>${field("Scheduled check-in (your browser timezone)", "checkinAt", "datetime-local", "required")}<fieldset class="quote-policy-fields"><legend>Cancellation deductions — percentage of deposit</legend><p>Enter your approved rates explicitly. They are saved with this quotation.</p>${field("Grace period after deposit capture (hours, 0 disables)", "graceHours", "number", 'min="0" max="168" required')}${field("During grace period, only if more than 24 hours before check-in (%)", "gracePercent", "number", 'min="0" max="100" required')}${field("Otherwise more than 7 days before check-in (%)", "earlyPercent", "number", 'min="0" max="100" required')}${field("More than 24 hours to 7 days before check-in (%)", "middlePercent", "number", 'min="0" max="100" required')}${field("Within 24 hours before check-in (%)", "latePercent", "number", 'min="0" max="100" required')}</fieldset>${field("Valid until", "expiresAt", "datetime-local", "required")}<label>Seller, supplier scope, inclusions, exclusions, taxes and cancellation/refund terms<textarea name="notes" minlength="30" maxlength="1200" required></textarea></label><button class="button" type="submit">Issue quotation</button><p class="form-status" role="status"></p></form>`,
    )
  )
    return;
  main.querySelectorAll("[data-reconcile],[data-refund]").forEach(
    (button) =>
      (button.onclick = async () => {
        const refund = button.hasAttribute("data-refund");
        if (
          refund &&
          !window.confirm(
            "Issue the recorded refund through Razorpay for this cancelled booking?",
          )
        )
          return;
        button.disabled = true;
        try {
          await request("/api/admin/refund", {
            method: "POST",
            body: JSON.stringify({
              bookingId: refund
                ? button.dataset.refund
                : button.dataset.reconcile,
              action: refund ? "refund" : "reconcile",
            }),
          });
          toast(
            refund
              ? "Refund request recorded."
              : "Provider payments reconciled.",
          );
          await adminPage(main, session, toast);
        } catch (e) {
          toast(e.message);
          button.disabled = false;
        }
      }),
  );
  main.querySelectorAll("[data-trip-action]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await request("/api/config?service=trip-actions", {
            method: "POST",
            body: JSON.stringify({
              bookingId: button.dataset.booking,
              action: button.dataset.tripAction,
            }),
          });
          toast("Booking updated.");
          await adminPage(main, session, toast);
        } catch (e) {
          toast(e.message);
          button.disabled = false;
        }
      }),
  );
  const form = document.querySelector("#quote-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.expiresAt = new Date(body.expiresAt).toISOString();
    body.checkinAt = new Date(body.checkinAt).toISOString();
    body.cancellationPolicy = Object.fromEntries(
      [
        "graceHours",
        "gracePercent",
        "earlyPercent",
        "middlePercent",
        "latePercent",
      ].map((k) => [k, body[k]]),
    );
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await request("/api/admin/quote", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast("Quotation issued.");
      await adminPage(main, session, toast);
    } catch (error) {
      form.querySelector(".form-status").textContent = error.message;
      button.disabled = false;
    }
  });
}
