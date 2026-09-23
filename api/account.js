import bookings from '../server/account/bookings.js';
import profile from '../server/account/profile.js';
import settings from '../server/account/settings.js';
import notifications from '../server/account/notifications.js';
import { json } from '../server/http.js';

// Static imports ensure Vercel includes every handler in this single function.
const handlers = { bookings, profile, settings, notifications };
export function accountResource(req) {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  // Prefer an original public pathname if Vercel preserves it. Do not allow
  // client query parameters to override a legacy URL's selected handler.
  const legacy = path.match(/^\/api\/(bookings|profile|settings|notifications)\/?$/);
  if (legacy) return legacy[1];
  if (path !== '/api/account' && path !== '/api/account/') return null;
  const resource = req.query?.resource;
  return typeof resource === 'string' && Object.hasOwn(handlers, resource) ? resource : null;
}
export default function handler(req, res) {
  const resource = accountResource(req);
  if (!resource) return json(res, 404, { error: 'Account endpoint not found.' });
  return handlers[resource](req, res);
}
