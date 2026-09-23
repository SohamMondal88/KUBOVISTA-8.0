import { isAdmin, requireSession } from '../auth.js';
import { query } from '../db.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const result = await query('SELECT * FROM traveler_profiles WHERE user_id = $1', [session.user.id]);
      return json(res, 200, { user: session.user, admin: isAdmin(session), profile: result.rows[0] || null });
    }
    const body = parseBody(req);
    const displayName = cleanText(body.displayName || session.user.name, 80);
    const values = [session.user.id, displayName, cleanText(body.phone, 24), cleanText(body.city, 80), cleanText(body.state, 80), cleanText(body.country || 'India', 80), cleanText(body.bio, 400), cleanText(body.travelStyle, 80), cleanText(body.accessibilityNotes, 500), cleanText(body.emergencyContactName, 100), cleanText(body.emergencyContactPhone, 24)];
    const result = await query(`INSERT INTO traveler_profiles (user_id,display_name,phone,city,state,country,bio,travel_style,accessibility_notes,emergency_contact_name,emergency_contact_phone)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name,phone=EXCLUDED.phone,city=EXCLUDED.city,state=EXCLUDED.state,country=EXCLUDED.country,bio=EXCLUDED.bio,travel_style=EXCLUDED.travel_style,accessibility_notes=EXCLUDED.accessibility_notes,emergency_contact_name=EXCLUDED.emergency_contact_name,emergency_contact_phone=EXCLUDED.emergency_contact_phone,updated_at=now()
      RETURNING *`, values);
    if (displayName) await query('UPDATE "user" SET "name"=$1, "updatedAt"=now() WHERE "id"=$2', [displayName, session.user.id]);
    return json(res, 200, { profile: result.rows[0] });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
