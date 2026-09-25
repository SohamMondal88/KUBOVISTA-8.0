import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig, vapidKey } from './firebase-config.js';
export const app = getApps().find(app => app.name === 'kubovistas-web') || initializeApp(firebaseConfig, 'kubovistas-web');
const consentKey = 'kubovistas.analytics-consent.v1';
let analytics;
let analyticsSDK;
let messaging;
let messagingSDK;
let analyticsLoading;
export function analyticsAllowed() {
  try { return localStorage.getItem(consentKey) === 'granted'; } catch { return false; }
}
export async function setAnalyticsConsent(enabled) {
  try { localStorage.setItem(consentKey, enabled ? 'granted' : 'denied'); }
  catch { throw new Error('Browser storage is unavailable. Analytics remains off.'); }
  if (!enabled) {
    window['ga-disable-' + firebaseConfig.measurementId] = true;
    analyticsSDK?.setConsent({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    if (analytics) analyticsSDK.setAnalyticsCollectionEnabled(analytics, false);
    return false;
  }
  return startAnalytics();
}
async function startAnalytics() {
  if (!analyticsAllowed()) return false;
  if (!analyticsLoading) analyticsLoading = (async () => {
    analyticsSDK = await import('firebase/analytics');
    if (!await analyticsSDK.isSupported() || !analyticsAllowed()) return false;
    window['ga-disable-' + firebaseConfig.measurementId] = false;
    analyticsSDK.setConsent({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    analytics ||= analyticsSDK.initializeAnalytics(app, { config: { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: location.origin + '/', page_referrer: '', page_title: 'KuboVistas' } });
    analyticsSDK.setAnalyticsCollectionEnabled(analytics, true);
    trackPublicPage();
    return true;
  })().finally(() => { analyticsLoading = null; });
  return analyticsLoading;
}
function trackPublicPage() {
  if (!analytics || !analyticsAllowed()) return;
  // Never send account IDs, reset tokens, searches, trip briefs or booking URLs.
  const section = (location.hash.slice(1).split('?')[0].split('/')[1] || 'home');
  if (!['home','destinations','destination','journeys','about','journal','guide','stays','camping','membership'].includes(section)) return;
  analyticsSDK.logEvent(analytics, 'page_view', { page_title: 'KuboVistas — ' + section, page_location: location.origin + '/#/' + (section === 'home' ? '' : section), page_referrer: '' });
}
async function getMessagingClient() {
  messagingSDK ||= await import('firebase/messaging');
  if (!window.isSecureContext || !await messagingSDK.isSupported()) throw new Error('Push notifications need HTTPS and a supported browser.');
  messaging ||= messagingSDK.getMessaging(app);
  return messaging;
}
// Call from a user click only. Tokens are deliberately not logged or stored in localStorage.
// This foundation does not subscribe users to booking notifications or save tokens to an account.
export async function requestPushToken() {
  if (!('Notification' in window)) throw new Error('This browser does not support notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not enabled. Review your browser site permissions to try again.');
  const client = await getMessagingClient();
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' });
  if (!registration.active) await new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) return reject(new Error('Notification worker unavailable.'));
    const timeout = setTimeout(() => reject(new Error('Notification setup timed out. Please retry.')), 15000);
    const check = () => {
      if (worker.state === 'activated') { clearTimeout(timeout); resolve(); }
      if (worker.state === 'redundant') { clearTimeout(timeout); reject(new Error('Notification worker could not start.')); }
    };
    worker.addEventListener('statechange', check); check();
  });
  return messagingSDK.getToken(client, { vapidKey, serviceWorkerRegistration: registration });
}
export async function disablePush() {
  // Return without initializing Messaging unless an existing worker is present.
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope');
  if (!registration) return;
  await getMessagingClient();
  await messagingSDK.deleteToken(messaging);
  await registration.unregister();
}
export function initializeFirebasePreferences() {
  document.getElementById('firebase-preferences-open')?.addEventListener('click', () => {
    const dialog = document.getElementById('firebase-preferences');
    dialog.querySelector('input').checked = analyticsAllowed();
    dialog.showModal();
  });
  const form = document.getElementById('firebase-preferences-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const enabled = form.querySelector('input').checked;
      const active = await setAnalyticsConsent(enabled);
      form.querySelector('[role=status]').textContent = enabled ? (active ? 'Analytics enabled.' : 'Analytics is unavailable in this browser.') : 'Analytics disabled. Previously collected data is not deleted by this choice.';
    } catch { form.querySelector('[role=status]').textContent = 'Could not enable Analytics. Please try again.'; }
    finally { button.disabled = false; }
  });
  window.addEventListener('hashchange', trackPublicPage);
  window.addEventListener('storage', event => {
    if (event.key === consentKey || event.key === null) {
      if (analyticsAllowed()) void startAnalytics().catch(() => {});
      else { window['ga-disable-' + firebaseConfig.measurementId] = true; if (analytics) analyticsSDK.setAnalyticsCollectionEnabled(analytics, false); }
    }
  });
  void startAnalytics().catch(() => {});
}
initializeFirebasePreferences();
