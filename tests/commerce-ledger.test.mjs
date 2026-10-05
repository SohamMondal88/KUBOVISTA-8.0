import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { syncRefund } from '../server/refund-state.js';

async function database() {
  const db = new PGlite();
  for (const name of ['001_auth_accounts_payments.sql','004_deposit_lifecycle.sql','007_firebase_identity_push.sql','008_checkout_integrity.sql','012_p0_critical_blockers.sql'])
    await db.exec((await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  await db.query(`INSERT INTO "user"(id,name,email) VALUES('traveler','Traveler','traveler@example.com'),('admin','Admin','admin@example.com')`);
  const booking=(await db.query(`INSERT INTO bookings(user_id,destination_id,destination_name,days,travelers,travel_style,budget_per_person_paise,status,quote_total_paise,advance_percent,payment_policy_version,current_quote_version)
    VALUES('traveler','goa','Goa',4,2,'slow',100000,'cancelled',500000,20,2,1) RETURNING *`)).rows[0];
  const quote=(await db.query(`INSERT INTO booking_quotes(booking_id,version,total_paise,advance_percent,notes,cancellation_policy,checkin_at,expires_at,issued_by)
    VALUES($1,1,500000,20,'Seller and scope', '{}',now()+interval '30 days',now()+interval '7 days','admin') RETURNING *`,[booking.id])).rows[0];
  const payment=(await db.query(`INSERT INTO payments(booking_id,user_id,razorpay_order_id,razorpay_payment_id,amount_paise,status,quote_id)
    VALUES($1,'traveler','order_test','pay_test',100000,'captured',$2) RETURNING *`,[booking.id,quote.id])).rows[0];
  return {db,booking,quote,payment};
}

test('quote versions and acceptance are immutable foreign-key records',async()=>{
  const {db,booking,quote,payment}=await database();
  try {
    await db.query(`INSERT INTO quote_acceptances(quote_id,booking_id,user_id,purpose) VALUES($1,$2,'traveler','deposit')`,[quote.id,booking.id]);
    assert.equal((await db.query('SELECT quote_id FROM payments WHERE id=$1',[payment.id])).rows[0].quote_id,quote.id);
    await assert.rejects(db.query(`INSERT INTO quote_acceptances(quote_id,booking_id,user_id,purpose) VALUES($1,$2,'traveler','deposit')`,[quote.id,booking.id]));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM quote_acceptances')).rows[0].n,1);
  }finally{await db.close();}
});

test('duplicate and reordered provider refund updates preserve one processed ledger row',async()=>{
  const {db,payment}=await database();
  try {
    const entity={id:'rfnd_test',payment_id:'pay_test',amount:25000,status:'processed'};
    await syncRefund(db,entity,payment);
    await syncRefund(db,entity,payment);
    await syncRefund(db,{...entity,status:'pending'},payment);
    const ledger=(await db.query('SELECT * FROM payment_refunds WHERE payment_id=$1',[payment.id])).rows;
    assert.equal(ledger.length,1);assert.equal(ledger[0].status,'processed');
    assert.equal((await db.query('SELECT status FROM payments WHERE id=$1',[payment.id])).rows[0].status,'captured');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM user_notifications')).rows[0].n,1);
  }finally{await db.close();}
});
