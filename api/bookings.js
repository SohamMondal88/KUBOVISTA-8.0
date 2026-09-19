import { destinations } from '../data.js';
import { requireSession } from '../server/auth.js';
import { query, transaction } from '../server/db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../server/http.js';

const bookingColumns = `id,destination_id,destination_name,days,travelers,travel_style,departure_date,budget_per_person_paise,notes,status,quote_total_paise,advance_percent,quote_notes,quote_expires_at,created_at,updated_at`;

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const id = cleanText(req.query?.id, 80);
      if (id) {
        const result = await query(`SELECT ${bookingColumns} FROM bookings WHERE id=$1 AND user_id=$2`, [id, session.user.id]);
        if (!result.rows[0]) return json(res, 404, { error: 'Trip request not found.' });
        return json(res, 200, { booking: result.rows[0] });
      }
      const result = await query(`SELECT ${bookingColumns} FROM bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [session.user.id]);
      return json(res, 200, { bookings: result.rows });
    }
    const body = parseBody(req);
    const destination = destinations.find(item => item.id === body.destination);
    if (!destination) return json(res, 400, { error: 'Choose a valid destination.' });
    const days = Math.round(Number(body.days));
    const travelers = Math.round(Number(body.travelers));
    const budget = Math.round(Number(body.budget));
    if (![days,travelers,budget].every(Number.isSafeInteger) || days < 1 || days > 60 || travelers < 1 || travelers > 30 || budget < 0 || budget > 10_000_000) return json(res, 400, { error: 'Review the trip duration, traveler count and budget.' });
    const departure = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
    const booking = await transaction(async client => {
      const created = await client.query(`INSERT INTO bookings (user_id,destination_id,destination_name,days,travelers,travel_style,departure_date,budget_per_person_paise,notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${bookingColumns}`,
        [session.user.id, destination.id, destination.name, days, travelers, cleanText(body.style, 80), departure, budget * 100, cleanText(body.notes, 1000)]);
      await client.query(`INSERT INTO user_notifications (user_id,title,message,kind) VALUES ($1,$2,$3,'booking')`, [session.user.id, 'Consultation request received', `Your ${destination.name} trip request is ready for expert review.`]);
      return created.rows[0];
    });
    return json(res, 201, { booking });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
