import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { packages } from '../packages.js';
import { destinations } from '../data.js';
import { checkAppToken } from '../server/app-check.js';
import { emailDispatchAuthorized, enqueueEmail } from '../server/transactional-email.js';
import { adsenseConfig } from '../scripts/adsense-config.mjs';

async function database(){
 const db=new PGlite();
 for(const name of ['001_auth_accounts_payments.sql','004_deposit_lifecycle.sql','007_firebase_identity_push.sql','008_checkout_integrity.sql','009_commercial_operations.sql'])
  await db.exec((await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 return db;
}
test('all signature packages use known destinations without invented prices',()=>{
 assert.equal(packages.length,10);
 assert.equal(new Set(packages.map(p=>p.id)).size,10);
 for(const p of packages){assert.ok(p.days>0);assert.ok(p.stops.length);assert.ok(p.stops.every(id=>destinations.some(d=>d.id===id)));assert.equal('price' in p,false);}
});
test('App Check fails closed when enforcement is active',async()=>{
 assert.equal(await checkAppToken({headers:{}},{enabled:false}),true);
 assert.equal(await checkAppToken({headers:{}},{enabled:true}),false);
 assert.equal(await checkAppToken({headers:{'x-firebase-appcheck':'signed'}},{enabled:true,verify:async()=>({appId:'web-app'})}),true);
 assert.equal(await checkAppToken({headers:{'x-firebase-appcheck':'bad'}},{enabled:true,verify:async()=>{throw Error('invalid')}}),false);
});
test('staff records and private mail are relational with stable event IDs',async()=>{
 const db=await database();
 try{
  await db.query("INSERT INTO \"user\"(id,name,email) VALUES('u1','Traveler','u@example.com')");
  const c=(await db.query("INSERT INTO support_cases(user_id,subject,category) VALUES('u1','A trip question','booking') RETURNING id")).rows[0];
  await db.query('INSERT INTO support_messages(case_id,author_id,body) VALUES($1,$2,$3)',[c.id,'u1','Hello, I need help']);
  await enqueueEmail(db,'u1','support:message-1','support_reply','Your case has a reply',{path:'/account/support'});
  await enqueueEmail(db,'u1','support:message-1','support_reply','Your case has a reply',{path:'/account/support'});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n,1);
  await assert.rejects(enqueueEmail(db,'u1','external','support_reply','Danger',{path:'https://evil.example'}));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM support_messages WHERE case_id=$1',[c.id])).rows[0].n,1);
 }finally{await db.close();}
});
test('ad and mail launch gates require verified external settings',()=>{
 assert.throws(()=>adsenseConfig({ADSENSE_ENABLED:'true',ADSENSE_CONSENT_READY:'true'}));
 assert.equal(emailDispatchAuthorized('Bearer '+'a'.repeat(32),'a'.repeat(32)),true);
 assert.equal(emailDispatchAuthorized('Bearer wrong','a'.repeat(32)),false);
 const headers=JSON.parse(requireFile());
 assert.ok(headers.headers.some(item=>item.headers.some(h=>h.key==='X-Content-Type-Options')));
});
function requireFile(){return headersText;}
const headersText=await readFile(new URL('../vercel.json',import.meta.url),'utf8');
