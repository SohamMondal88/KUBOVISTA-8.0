import { requireSession } from '../auth.js';
import { firestore, plain, serverTimestamp } from '../firestore.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

const bool = value => value === true;

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const snapshot=await firestore().collection('settings').doc(session.user.id).get();
      return json(res, 200, { settings: snapshot.exists ? plain(snapshot.data()) : { email_trip_updates: true, email_offers: false, product_updates: true, profile_visibility: 'private', preferred_language: 'English', preferred_currency: 'INR' } });
    }
    const body = parseBody(req);
    const visibility = body.profileVisibility === 'companions' ? 'companions' : 'private';
    const language = ['English', 'বাংলা', 'हिन्दी'].includes(body.preferredLanguage) ? body.preferredLanguage : 'English';
    const currency = body.preferredCurrency === 'INR' ? 'INR' : 'INR';
    const settings={user_id:session.user.id,email_trip_updates:bool(body.emailTripUpdates),email_offers:bool(body.emailOffers),product_updates:bool(body.productUpdates),profile_visibility:visibility,preferred_language:cleanText(language,30),preferred_currency:currency,updated_at:serverTimestamp()};
    await firestore().collection('settings').doc(session.user.id).set(settings,{merge:true});
    return json(res, 200, { settings:{...settings,updated_at:new Date().toISOString()} });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
