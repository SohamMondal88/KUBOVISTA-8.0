import { requireSession } from '../server/auth.js';
import { firestore, snapshotData } from '../server/firestore.js';
import { json, methodNotAllowed, publicError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const db=firestore();
    const snapshot=await db.collection('payments').where('user_id','==',session.user.id).limit(100).get();
    const payments=await Promise.all(snapshot.docs.map(async item=>{const payment=snapshotData(item);const booking=await db.collection('bookings').doc(payment.booking_id).get();return {...payment,destination_name:booking.exists?booking.data().destination_name:''};}));
    payments.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return json(res, 200, { payments });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
