const consentKey = "kubovistas.analytics-consent.v1";
const measurementId = "G-MMP3139QSB";
let analyticsPromise;

window.dataLayer ||= [];
window.gtag ||= function gtag() {
  window.dataLayer.push(arguments);
};
window["ga-disable-" + measurementId] = true;

export function analyticsAllowed() {
  try {
    return localStorage.getItem(consentKey) === "granted";
  } catch {
    return false;
  }
}

function loadAnalytics() {
  if (window.google_tag_manager) return Promise.resolve();
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.async = true;
    script.dataset.kubovistasAnalytics = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener(
      "error",
      () => reject(Error("Analytics could not be loaded.")),
      { once: true },
    );
    document.head.append(script);
  }).catch((error) => {
    analyticsPromise = undefined;
    throw error;
  });
  return analyticsPromise;
}

export function trackPublicPage() {
  if (!analyticsAllowed() || typeof window.gtag !== "function") return;
  const pathname = location.pathname || "/";
  if (
    /^\/(account|planner)(?:\/|$)/.test(pathname) ||
    /^\/journal\/(write|my-stories|journal-review)(?:\/|$)/.test(pathname)
  )
    return;
  const section = pathname.split("/").filter(Boolean)[0] || "home";
  if (
    ![
      "home",
      "destinations",
      "journeys",
      "company",
      "journal",
      "guides",
      "membership",
      "legal",
    ].includes(section)
  )
    return;
  window.gtag("event", "page_view", {
    send_to: measurementId,
    page_title: document.title,
    page_location: location.origin + pathname,
    page_referrer: "",
  });
}

async function startAnalytics() {
  if (!analyticsAllowed()) return false;
  await loadAnalytics();
  window["ga-disable-" + measurementId] = false;
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  trackPublicPage();
  return true;
}

export async function setAnalyticsConsent(enabled) {
  try {
    localStorage.setItem(consentKey, enabled ? "granted" : "denied");
  } catch {
    throw new Error("Browser storage is unavailable. Analytics remains off.");
  }
  if (!enabled) {
    window["ga-disable-" + measurementId] = true;
    window.gtag?.("consent", "update", { analytics_storage: "denied" });
    return false;
  }
  return startAnalytics();
}

export function initializeConsentPreferences() {
  document
    .getElementById("firebase-preferences-open")
    ?.addEventListener("click", () => {
      const dialog = document.getElementById("firebase-preferences");
      dialog.querySelector("input").checked = analyticsAllowed();
      dialog.showModal();
    });
  const form = document.getElementById("firebase-preferences-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const enabled = form.querySelector("input").checked;
      const active = await setAnalyticsConsent(enabled);
      form.querySelector("[role=status]").textContent = enabled
        ? active
          ? "Analytics enabled."
          : "Analytics is unavailable in this browser."
        : "Analytics disabled. Previously collected data is not deleted by this choice.";
    } catch {
      form.querySelector("[role=status]").textContent =
        "Could not enable Analytics. Please try again.";
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener("popstate", trackPublicPage);
  window.addEventListener("kubovistas:navigate", trackPublicPage);
  window.addEventListener("storage", (event) => {
    if (event.key === consentKey || event.key === null) {
      if (analyticsAllowed()) void startAnalytics().catch(() => {});
      else {
        window["ga-disable-" + measurementId] = true;
        window.gtag?.("consent", "update", { analytics_storage: "denied" });
      }
    }
  });
  if (analyticsAllowed()) void startAnalytics().catch(() => {});
}

initializeConsentPreferences();
