import {flushPushSafely} from '../firebase-push.js';
import { validateDepartureDate } from '../booking-validation.js';
import { destinations } from '../../data.js';
import { requireSession } from '../auth.js';
import { addNotification, firestore, newId, plain, serverTimestamp, snapshotData } from '../firestore.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const id = cleanText(req.query?.id, 80);
      if (id) {
        const snapshot=await firestore().collection('bookings').doc(id).get();
        const booking=snapshotData(snapshot);
        if (!booking || booking.user_id!==session.user.id) return json(res, 404, { error: 'Trip request not found.' });
        return json(res, 200, { booking });
      }
      const snapshot=await firestore().collection('bookings').where('user_id','==',session.user.id).limit(100).get();
      const bookings=snapshot.docs.map(snapshotData).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
      return json(res, 200, { bookings });
    }
    const body = parseBody(req);
    const destination = destinations.find(item => item.id === body.destination);
    if (!destination) return json(res, 400, { error: 'Choose a valid destination.' });
    const days = Math.round(Number(body.days));
    const travelers = Math.round(Number(body.travelers));
    const budget = Math.round(Number(body.budget));
    if (![days,travelers,budget].every(Number.isSafeInteger) || days < 1 || days > 60 || travelers < 1 || travelers > 30 || budget < 0 || budget > 10_000_000) return json(res, 400, { error: 'Review the trip duration, traveler count and budget.' });
    let departure;
    try { departure = validateDepartureDate(body.date); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const db=firestore(),id=newId(),ref=db.collection('bookings').doc(id);
    const booking={id,user_id:session.user.id,destination_id:destination.id,destination_name:destination.name,days,travelers,travel_style:cleanText(body.style,80),departure_date:departure,budget_per_person_paise:budget*100,notes:cleanText(body.notes,1000),itinerary:Array.isArray(body.itinerary)?body.itinerary.slice(0,days).map(x=>cleanText(x,600)):[],status:'consultation_requested',quote_total_paise:null,advance_percent:null,created_at:serverTimestamp(),updated_at:serverTimestamp()};
    await db.runTransaction(async transaction=>{
      transaction.create(ref,booking);
      await addNotification(session.user.id,'Consultation request received',`Your ${destination.name} trip request is ready for expert review.`,'booking',transaction);
    });
    await flushPushSafely(session.user.id);
    return json(res, 201, { booking:{...booking,created_at:new Date().toISOString(),updated_at:new Date().toISOString()} });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
