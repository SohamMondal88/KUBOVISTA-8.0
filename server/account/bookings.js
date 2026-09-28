import { flushPushSafely } from '../firebase-push.js';
import { validateDepartureDate } from '../booking-validation.js';
import { destinations } from '../../data.js';
import { requireSession } from '../auth.js';
import { query, transaction } from '../db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const id = cleanText(req.query?.id, 80);
      if (id) {
        const result = await query('SELECT * FROM bookings WHERE id::text=$1 AND user_id=$2', [id, session.user.id]);
        if (!result.rows[0]) return json(res, 404, { error: 'Trip request not found.' });
        return json(res, 200, { booking: result.rows[0] });
      }
      const result = await query('SELECT * FROM bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [session.user.id]);
      return json(res, 200, { bookings: result.rows });
    }
    const body = parseBody(req);
    const destination = destinations.find(item => item.id === body.destination);
    if (!destination) return json(res, 400, { error: 'Choose a valid destination.' });
    const days = Number(body.days), travelers = Number(body.travelers), budget = Number(body.budget);
    if (![days, travelers, budget].every(Number.isSafeInteger) || days < 1 || days > 60 || travelers < 1 || travelers > 30 || budget < 0 || budget > 10_000_000) return json(res, 400, { error: 'Review the trip duration, traveler count and budget.' });
    let departure;
    try { departure = validateDepartureDate(body.date); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const itinerary = Array.isArray(body.itinerary) ? body.itinerary.slice(0, days).map(x => cleanText(x, 600)) : [];
    const booking = await transaction(async client => {
      const inserted = await client.query(`INSERT INTO bookings (user_id,destination_id,destination_name,days,travelers,travel_style,departure_date,budget_per_person_paise,notes,itinerary)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [session.user.id, destination.id, destination.name, days, travelers, cleanText(body.style, 80), departure, budget * 100, cleanText(body.notes, 1000), JSON.stringify(itinerary)]);
      await client.query(`INSERT INTO user_notifications (user_id,title,message,kind) VALUES ($1,$2,$3,'booking')`,
        [session.user.id, 'Consultation request received', `Your ${destination.name} trip request is ready for expert review.`]);
      return inserted.rows[0];
    });
    await flushPushSafely(session.user.id);
    return json(res, 201, { booking });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
