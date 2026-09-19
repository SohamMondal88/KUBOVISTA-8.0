import { requireSession } from '../server/auth.js';
import { query } from '../server/db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../server/http.js';

const bool = value => value === true;

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const result = await query('SELECT * FROM traveler_settings WHERE user_id=$1', [session.user.id]);
      return json(res, 200, { settings: result.rows[0] || { email_trip_updates: true, email_offers: false, product_updates: true, profile_visibility: 'private', preferred_language: 'English', preferred_currency: 'INR' } });
    }
    const body = parseBody(req);
    const visibility = body.profileVisibility === 'companions' ? 'companions' : 'private';
    const language = ['English', 'বাংলা', 'हिन्दी'].includes(body.preferredLanguage) ? body.preferredLanguage : 'English';
    const currency = body.preferredCurrency === 'INR' ? 'INR' : 'INR';
    const result = await query(`INSERT INTO traveler_settings (user_id,email_trip_updates,email_offers,product_updates,profile_visibility,preferred_language,preferred_currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id) DO UPDATE SET email_trip_updates=EXCLUDED.email_trip_updates,email_offers=EXCLUDED.email_offers,product_updates=EXCLUDED.product_updates,profile_visibility=EXCLUDED.profile_visibility,preferred_language=EXCLUDED.preferred_language,preferred_currency=EXCLUDED.preferred_currency,updated_at=now()
      RETURNING *`, [session.user.id, bool(body.emailTripUpdates), bool(body.emailOffers), bool(body.productUpdates), visibility, cleanText(language, 30), currency]);
    return json(res, 200, { settings: result.rows[0] });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
