import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {resolveFirebaseUser} from '../server/firebase-identity.js';
import {dispatchPush,dispatcherAuthorized,privatePushPayload,validPushToken} from '../server/firebase-push.js';
let db;
const clientFor=client=>({query:async(sql,params)=>{const r=await client.query(sql,params);return {...r,rowCount:r.affectedRows||r.rows.length};}});
const runQuery=async(sql,params)=>clientFor(db).query(sql,params);
const tx=fn=>db.transaction(client=>fn(clientFor(client)));
before(async()=>{
 db=new PGlite();
 const names=(await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort();
 for(const name of names){let sql=await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8');sql=sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');await db.exec(sql);}
 process.env.FIREBASE_PUSH_ENABLED='true';process.env.APP_URL='https://kubo.example';
});
after(async()=>{await db.close();});
test('unverified Firebase identity never creates or claims an account',async()=>{
 await assert.rejects(resolveFirebaseUser({uid:'no',email:'a@b.com',email_verified:false},tx),/Verify/);
 assert.equal((await runQuery('SELECT id FROM "user"')).rowCount,0);
});
test('verified identity creates one user; repeat sign-in preserves original booking ownership',async()=>{
 const token={uid:'firebase-a',email:'a@b.com',name:'A',email_verified:true};
 const a=await resolveFirebaseUser(token,tx),again=await resolveFirebaseUser(token,tx);
 assert.equal(a.id,again.id);assert.equal(a.firebaseUid,'firebase-a');
 await runQuery('INSERT INTO bookings(user_id,destination_id,destination_name,days,travelers,travel_style,budget_per_person_paise) VALUES($1,\'goa\',\'Goa\',3,1,\'Solo\',100)',[a.id]);
 assert.equal((await runQuery('SELECT id FROM bookings WHERE user_id=$1',[again.id])).rowCount,1);
});
test('matching email does not allow a new Firebase UID to take a legacy account',async()=>{
 await runQuery('INSERT INTO "user"(id,name,email) VALUES(\'legacy\',\'Original\',\'legacy@b.com\')');
 await assert.rejects(resolveFirebaseUser({uid:'attacker',email:'legacy@b.com',email_verified:true},tx),/needs migration/);
 assert.equal((await runQuery('SELECT firebase_uid FROM "user" WHERE id=\'legacy\'')).rows[0].firebase_uid,null);
 await runQuery('UPDATE "user" SET firebase_uid=\'imported-uid\' WHERE id=\'legacy\'');
 assert.equal((await resolveFirebaseUser({uid:'imported-uid',email:'legacy@b.com',email_verified:true},tx)).id,'legacy');
});
test('disabled local account cannot regain access with an otherwise valid identity',async()=>{
 await runQuery('UPDATE "user" SET disabled_at=now() WHERE id=\'legacy\'');
 await assert.rejects(resolveFirebaseUser({uid:'imported-uid',email:'legacy@b.com',email_verified:true},tx),/closed/);
});
test('notification insert and its device deliveries commit or roll back together',async()=>{
 const a=(await runQuery('SELECT id FROM "user" WHERE firebase_uid=\'firebase-a\'')).rows[0];
 await runQuery('INSERT INTO firebase_devices(token_hash,token,user_id) VALUES(\'hash-a\',\'token-a\',$1)',[a.id]);
 await assert.rejects(tx(async client=>{await client.query('INSERT INTO user_notifications(user_id,title,message) VALUES($1,\'Rollback\',\'private\')',[a.id]);throw Error('rollback');}));
 assert.equal((await runQuery('SELECT * FROM firebase_push_deliveries')).rowCount,0);
 await runQuery('INSERT INTO user_notifications(user_id,title,message) VALUES($1,\'Payment received\',\'Private destination\')',[a.id]);
 assert.equal((await runQuery('SELECT * FROM firebase_push_deliveries')).rowCount,1);
});
test('provider failure remains retryable, success is recorded, repeats do not resend',async()=>{
 await dispatchPush({runQuery,send:async()=>{throw Object.assign(Error('temporary'),{code:'messaging/server-unavailable'});}});
 let delivery=(await runQuery('SELECT * FROM firebase_push_deliveries')).rows[0];
 assert.equal(delivery.sent_at,null);assert.equal(delivery.attempts,1);
 await runQuery('UPDATE firebase_push_deliveries SET available_at=now()');
 const sent=[];await dispatchPush({runQuery,send:async message=>{sent.push(message);}});
 assert.equal(sent.length,1);assert.equal(sent[0].notification.body.includes('Private'),false);
 await dispatchPush({runQuery,send:async()=>assert.fail('duplicate delivery')});
});
test('token reassignment cannot send the former owner queue',async()=>{
 const a=(await runQuery('SELECT id FROM "user" WHERE firebase_uid=\'firebase-a\'')).rows[0];
 await runQuery('INSERT INTO user_notifications(user_id,title,message) VALUES($1,\'Old account\',\'private\')',[a.id]);
 const b=await resolveFirebaseUser({uid:'firebase-b',email:'b@b.com',email_verified:true},tx);
 await runQuery('UPDATE firebase_devices SET user_id=$1 WHERE token_hash=\'hash-a\'',[b.id]);
 await dispatchPush({runQuery,send:async()=>assert.fail('cross-account delivery')});
});
test('invalid device token is pruned, including its queued deliveries',async()=>{
 const b=(await runQuery('SELECT id FROM "user" WHERE firebase_uid=\'firebase-b\'')).rows[0];
 await runQuery('INSERT INTO user_notifications(user_id,title,message) VALUES($1,\'New\',\'private\')',[b.id]);
 await dispatchPush({runQuery,send:async()=>{throw Object.assign(Error(),{code:'messaging/registration-token-not-registered'});}});
 assert.equal((await runQuery('SELECT * FROM firebase_devices')).rowCount,0);
});
test('dispatcher secrets and device inputs fail closed; push content is generic',()=>{
 assert.equal(dispatcherAuthorized(undefined,'x'.repeat(32)),false);
 assert.equal(dispatcherAuthorized('Bearer '+'x'.repeat(32),'x'.repeat(32)),true);
 assert.equal(dispatcherAuthorized('Bearer wrong','x'.repeat(32)),false);
 assert.equal(validPushToken('<script>'),false);assert.equal(validPushToken('a'.repeat(5000)),false);
 const payload=privatePushPayload({token:'abc',notification_id:'id',message:'secret',title:'secret'},'https://kubo.example');
 assert.equal(JSON.stringify(payload).includes('secret'),false);
});
