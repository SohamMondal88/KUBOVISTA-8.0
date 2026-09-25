import test from 'node:test';
import assert from 'node:assert/strict';
import {readFirebaseSession} from '../server/auth.js';
test('old auth cookies never authenticate a request',async()=>{
 const req={headers:{cookie:'better-auth.session_token=old-session'}};
 assert.equal(await readFirebaseSession(req,{verify:()=>assert.fail('must not verify cookie')}),null);
});
test('server requires Firebase revocation checking and maps only verified token data',async()=>{
 let decoded;
 const s=await readFirebaseSession({headers:{authorization:'Bearer signed-token'}},{configured:()=>true,verify:async(token,revoked)=>{assert.equal(token,'signed-token');assert.equal(revoked,true);return {uid:'trusted',auth_time:123,email_verified:true};},resolve:async value=>{decoded=value;return {id:'database-owner'};}});
 assert.equal(s.user.id,'database-owner');assert.equal(s.firebaseUid,'trusted');assert.equal(decoded.uid,'trusted');
});
test('expired, revoked, disabled and malformed tokens never reach user mapping',async()=>{
 for(const code of ['auth/id-token-expired','auth/id-token-revoked','auth/user-disabled','auth/invalid-id-token'])assert.equal(await readFirebaseSession({headers:{authorization:'Bearer invalid'}},{configured:()=>true,verify:async()=>{throw {code};},resolve:()=>assert.fail('untrusted mapping')}),null);
});
test('Firebase outage is service unavailability, not an accepted identity',async()=>{
 await assert.rejects(readFirebaseSession({headers:{authorization:'Bearer token'}},{configured:()=>true,verify:async()=>{throw {code:'auth/internal-error'};},resolve:()=>assert.fail('outage mapping')}),error=>error.status===503);
});
