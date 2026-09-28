import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
let env;
before(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Run via npm run test:firestore.');
 env=await initializeTestEnvironment({projectId:'demo-kubovistas',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
});
after(async()=>{await env?.cleanup();});
test('private profile owner can write approved fields; strangers and extra roles cannot',async()=>{
 const owner=env.authenticatedContext('alice').firestore(),other=env.authenticatedContext('bob').firestore();
 const valid={displayName:'Alice',photoURL:'',city:'Kolkata',travelStyle:'Slow',bio:'',updatedAt:new Date()};
 await assertSucceeds(setDoc(doc(owner,'users/alice'),valid));
 await assertFails(getDoc(doc(other,'users/alice')));
 await assertFails(updateDoc(doc(owner,'users/alice'),{role:'admin'}));
 await assertFails(setDoc(doc(other,'users/alice'),{...valid,displayName:'Bob'}));
});
test('drafts are owner-only and business collections deny browser writes',async()=>{
 const owner=env.authenticatedContext('alice').firestore(),other=env.authenticatedContext('bob').firestore();
 const draft={destination:'Goa',startDate:'2027-01-01',endDate:'2027-01-05',travellers:2,notes:'',createdAt:new Date(),updatedAt:new Date()};
 await assertSucceeds(setDoc(doc(owner,'users/alice/tripDrafts/one'),draft));
 await assertFails(getDoc(doc(other,'users/alice/tripDrafts/one')));
 await assertFails(setDoc(doc(owner,'bookings/one'),{user_id:'alice',status:'confirmed'}));
 await assertFails(setDoc(doc(owner,'payments/one'),{amount_paise:100}));
 await assertFails(setDoc(doc(owner,'notifications/one'),{user_id:'alice'}));
});
test('only published stories are public and authors cannot publish themselves',async()=>{
 const anonymous=env.unauthenticatedContext().firestore(),owner=env.authenticatedContext('alice').firestore();
 await assertSucceeds(setDoc(doc(owner,'stories/draft'),{authorUid:'alice',title:'A travel note',body:'A thoughtful visit',status:'draft',createdAt:new Date(),updatedAt:new Date()}));
 await assertFails(getDoc(doc(anonymous,'stories/draft')));
 await assertFails(updateDoc(doc(owner,'stories/draft'),{status:'published'}));
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'stories/public'),{authorUid:'alice',title:'Published',body:'Approved story',status:'published',createdAt:new Date(),updatedAt:new Date()}));
 await assertSucceeds(getDoc(doc(anonymous,'stories/public')));
});
