import { isAdmin, requireSession } from '../auth.js';
import { firestore, plain, serverTimestamp } from '../firestore.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const snapshot = await firestore().collection('profiles').doc(session.user.id).get();
      return json(res, 200, { user: session.user, admin: isAdmin(session), profile: snapshot.exists ? plain(snapshot.data()) : null });
    }
    const body = parseBody(req);
    const displayName = cleanText(body.displayName || session.user.name, 80);
    const profile = { user_id: session.user.id, display_name: displayName, phone: cleanText(body.phone, 24), city: cleanText(body.city, 80), state: cleanText(body.state, 80), country: cleanText(body.country || 'India', 80), bio: cleanText(body.bio, 400), travel_style: cleanText(body.travelStyle, 80), accessibility_notes: cleanText(body.accessibilityNotes, 500), emergency_contact_name: cleanText(body.emergencyContactName, 100), emergency_contact_phone: cleanText(body.emergencyContactPhone, 24), updated_at: serverTimestamp() };
    const db=firestore();
    await db.runTransaction(async transaction=>{
      transaction.set(db.collection('profiles').doc(session.user.id),profile,{merge:true});
      if(displayName)transaction.set(db.collection('users').doc(session.user.id),{name:displayName,updated_at:serverTimestamp()},{merge:true});
    });
    return json(res, 200, { profile: { ...profile, updated_at: new Date().toISOString() } });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
