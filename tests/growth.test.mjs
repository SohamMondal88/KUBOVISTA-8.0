import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {regions,regionById,publicCatalog,searchCatalog} from '../search-catalog.js';
import {groundedKnowledge} from '../grounded-knowledge.js';

async function db(){const p=new PGlite();for(const file of ['001_auth_accounts_payments.sql','004_deposit_lifecycle.sql','007_firebase_identity_push.sql','008_checkout_integrity.sql','009_commercial_operations.sql','010_growth.sql'])await p.exec((await readFile(new URL('../db/migrations/'+file,import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));return p;}
test('six region hubs include matching destinations and search uses published source catalog',()=>{
 assert.equal(regions.length,6);for(const region of regions)assert.equal(regionById(region.id),region);
 assert.ok(publicCatalog().length>35);
 assert.ok(searchCatalog('darjeeling').some(result=>result.path==='/destinations/darjeeling'));
 assert.deepEqual(searchCatalog(''),[]);
 assert.ok(searchCatalog('never-a-real-place').length===0);
});
test('grounded assistant returns deterministic source links and excludes sponsored articles',()=>{
 const a=groundedKnowledge('Darjeeling', [{slug:'sponsored',title:'Darjeeling sale',summary:'Paid',sponsored:true,status:'published',locale:'en'}]);
 assert.ok(a.links.some(link=>link.href==='/destinations/darjeeling'));
 assert.ok(!a.links.some(link=>link.href==='/stories/sponsored'));
 assert.ok(a.facts.every(x=>x.url.startsWith('/')));
});
test('growth schema enforces unique translations, one review per booking and supplier response',async()=>{
 const p=await db();try{
  await p.query("INSERT INTO \"user\"(id,name,email,\"emailVerified\") VALUES('u','Traveler','traveler@example.com',true)");
  const booking=(await p.query("INSERT INTO bookings(user_id,destination_id,destination_name,days,travelers,travel_style,budget_per_person_paise) VALUES('u','darjeeling','Darjeeling',4,2,'Slow',100000) RETURNING id")).rows[0];
  await p.query("INSERT INTO editorial_pages(slug,locale,title,summary,body,author_id) VALUES('hill-notes','en','Hill notes','A practical travel itinerary', $1,'u')",['A'.repeat(100)]);
  await assert.rejects(p.query("INSERT INTO editorial_pages(slug,locale,title,summary,body,author_id) VALUES('hill-notes','en','Hill notes','A practical travel itinerary',$1,'u')",['A'.repeat(100)]));
  await p.query("INSERT INTO editorial_pages(slug,locale,title,summary,body,author_id) VALUES('hill-notes','bn','পাহাড়ের কথা','বাংলায় ভ্রমণের গল্প এখানে',$1,'u')",['আ'.repeat(90)]);
  await p.query('INSERT INTO traveler_reviews(booking_id,user_id,rating,title,body) VALUES($1,$2,5,$3,$4)',[booking.id,'u','Honest trip','A'.repeat(60)]);
  await assert.rejects(p.query('INSERT INTO traveler_reviews(booking_id,user_id,rating,title,body) VALUES($1,$2,3,$3,$4)',[booking.id,'u','Other view','B'.repeat(60)]));
  assert.equal((await p.query("SELECT count(*)::int AS n FROM editorial_pages WHERE slug='hill-notes'")).rows[0].n,2);
 }finally{await p.close();}
});
test('supplier assignment visibility follows the granted supplier account',async()=>{
 const p=await db();try{
  await p.query("INSERT INTO \"user\"(id,name,email,\"emailVerified\") VALUES('traveler','Traveler','t@example.com',true),('vendor1','One','one@example.com',true),('vendor2','Two','two@example.com',true)");
  const booking=(await p.query("INSERT INTO bookings(user_id,destination_id,destination_name,days,travelers,travel_style,budget_per_person_paise,status) VALUES('traveler','darjeeling','Darjeeling',4,2,'Slow',100000,'confirmed') RETURNING id")).rows[0];
  const supplier=(await p.query("INSERT INTO suppliers(name,kind,status) VALUES('Mountain Stay','stay','approved') RETURNING id")).rows[0];
  await p.query('INSERT INTO booking_suppliers(booking_id,supplier_id,confirmation_reference) VALUES($1,$2,$3)',[booking.id,supplier.id,'STAFF-CONFIRMED']);
  await p.query('INSERT INTO supplier_accounts(supplier_id,user_id,created_by) VALUES($1,$2,$3)',[supplier.id,'vendor1','traveler']);
  const visible=async user=>(await p.query(`SELECT b.id FROM supplier_accounts sa JOIN suppliers s ON s.id=sa.supplier_id JOIN booking_suppliers bs ON bs.supplier_id=s.id JOIN bookings b ON b.id=bs.booking_id WHERE sa.user_id=$1 AND s.status='approved' AND b.status!='cancelled'`,[user])).rows;
  assert.equal((await visible('vendor1')).length,1);assert.equal((await visible('vendor2')).length,0);
  await p.query("UPDATE booking_suppliers SET supplier_response='declined' WHERE booking_id=$1 AND supplier_id=$2",[booking.id,supplier.id]);
  assert.equal((await p.query("SELECT count(*)::int AS n FROM booking_suppliers WHERE booking_id=$1 AND supplier_response='accepted'",[booking.id])).rows[0].n,0);
 }finally{await p.close();}
});
