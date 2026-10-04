import { isAdmin, requireSession } from "../auth.js";
import { query, transaction } from "../db.js";
import {
  cleanText,
  json,
  methodNotAllowed,
  parseBody,
  publicError,
} from "../http.js";

export default async function handler(req, res) {
  if (!["GET", "PUT"].includes(req.method))
    return methodNotAllowed(res, ["GET", "PUT"]);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === "GET") {
      const profile = await query(
        "SELECT display_name,phone,city,state,country,bio,travel_style,accessibility_notes,emergency_contact_name,emergency_contact_phone,updated_at FROM traveler_profiles WHERE user_id=$1",
        [session.user.id],
      );
      return json(res, 200, {
        user: session.user,
        admin: isAdmin(session),
        profile: profile.rows[0] || null,
      });
    }
    const body = parseBody(req);
    const displayName = cleanText(body.displayName || session.user.name, 80);
    const values = [
      displayName,
      cleanText(body.phone, 24),
      cleanText(body.city, 80),
      cleanText(body.state, 80),
      cleanText(body.country || "India", 80),
      cleanText(body.bio, 400),
      cleanText(body.travelStyle, 80),
      cleanText(body.accessibilityNotes, 500),
      cleanText(body.emergencyContactName, 100),
      cleanText(body.emergencyContactPhone, 24),
    ];
    const profile = await transaction(async (client) => {
      const saved = await client.query(
        `INSERT INTO traveler_profiles(user_id,display_name,phone,city,state,country,bio,travel_style,accessibility_notes,emergency_contact_name,emergency_contact_phone)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(user_id) DO UPDATE SET display_name=$2,phone=$3,city=$4,state=$5,country=$6,bio=$7,travel_style=$8,accessibility_notes=$9,emergency_contact_name=$10,emergency_contact_phone=$11,updated_at=now()
       RETURNING display_name,phone,city,state,country,bio,travel_style,accessibility_notes,emergency_contact_name,emergency_contact_phone,updated_at`,
        [session.user.id, ...values],
      );
      if (displayName)
        await client.query(
          'UPDATE "user" SET name=$2,"updatedAt"=now() WHERE id=$1',
          [session.user.id, displayName],
        );
      return saved.rows[0];
    });
    return json(res, 200, { profile });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
