// One-time import. Run after SQL migrations, with a database backup and
// payment writes disabled. Dry-run by default; --apply performs writes.
import { firestore, plain } from '../server/firestore.js';
import { getPool, transaction } from '../server/db.js';
const apply = process.argv.includes('--apply');
const db = firestore();
async function all(name) {
  const rows = []; let cursor;
  while (true) {
    let ref = db.collection(name).orderBy('__name__').limit(200);
    if (cursor) ref = ref.startAfter(cursor);
    const snapshot = await ref.get();
    rows.push(...snapshot.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) })));
    if (snapshot.size < 200) break;
    cursor = snapshot.docs.at(-1);
  }
  return rows;
}
const [users, bookings, payments, notifications] = await Promise.all(['users','bookings','payments','notifications'].map(all));
console.log({ mode: apply ? 'apply' : 'dry-run', users: users.length, bookings: bookings.length, payments: payments.length, notifications: notifications.length });
if (!apply) process.exit(0);
try {
  await transaction(async client => {
    for (const u of users) {
      if (!u.email) throw new Error(`User ${u.id} has no email; resolve before importing.`);
      await client.query(`INSERT INTO "user"(id,firebase_uid,name,email,"emailVerified",role,disabled_at)
        VALUES($1,$1,$2,$3,$4,'traveler',$5) ON CONFLICT(id) DO NOTHING`,
      [u.id,u.name || 'Traveler',u.email,false,u.disabled_at || null]);
    }
    for (const b of bookings) {
      await client.query(`INSERT INTO bookings(id,user_id,destination_id,destination_name,days,travelers,travel_style,departure_date,budget_per_person_paise,notes,status,quote_total_paise,advance_percent,quote_notes,quote_expires_at,itinerary,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(id) DO NOTHING`,
      [b.id,b.user_id,b.destination_id,b.destination_name,b.days,b.travelers,b.travel_style || '',b.departure_date || null,b.budget_per_person_paise || 0,b.notes || '',b.status || 'consultation_requested',b.quote_total_paise || null,b.advance_percent || 20,b.quote_notes || null,b.quote_expires_at || null,JSON.stringify(b.itinerary || []),b.created_at || new Date(),b.updated_at || new Date()]);
    }
    for (const p of payments) {
      if (!p.razorpay_order_id) throw new Error(`Payment ${p.id} has no order ID; resolve manually.`);
      await client.query(`INSERT INTO payments(id,booking_id,user_id,razorpay_order_id,razorpay_payment_id,amount_paise,currency,status,purpose,signature_verified,captured_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING`,
      [p.id,p.booking_id,p.user_id,p.razorpay_order_id,p.razorpay_payment_id || null,p.amount_paise,p.currency || 'INR',p.status || 'created',p.purpose || 'deposit',Boolean(p.signature_verified),p.captured_at || null,p.created_at || new Date(),p.updated_at || new Date()]);
    }
    for (const n of notifications) {
      await client.query(`INSERT INTO user_notifications(id,user_id,title,message,kind,read_at,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      [n.id,n.user_id,n.title,n.message,n.kind || 'account',n.read_at || null,n.created_at || new Date()]);
    }
  });
  console.log('Import committed. Reconcile every provider order before enabling checkout.');
} finally { await getPool().end(); }
