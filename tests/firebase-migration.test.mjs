import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFirebaseUser } from '../server/firebase-identity.js';
import { dispatcherAuthorized, privatePushPayload, validPushToken } from '../server/firebase-push.js';

function fakeFirestore() {
  const documents = new Map();
  const reference = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
  const snapshot = ref => ({ id: ref.id, exists: documents.has(ref.key), data: () => documents.get(ref.key) });
  const db = {
    documents,
    collection(name) { return { doc: id => reference(name, id) }; },
    async runTransaction(callback) {
      return callback({
        get: async ref => snapshot(ref),
        set(ref, value, options) { documents.set(ref.key, options?.merge ? { ...documents.get(ref.key), ...value } : value); }
      });
    }
  };
  return db;
}

test('unverified Firebase identity never creates an account', async () => {
  const db=fakeFirestore();
  await assert.rejects(resolveFirebaseUser({uid:'no',email:'a@b.com',email_verified:false},db),/Verify/);
  assert.equal(db.documents.size,0);
});

test('verified identity maps idempotently to its Firebase UID',async()=>{
  const db=fakeFirestore(),token={uid:'firebase-a',email:'a@b.com',name:'A',email_verified:true};
  const first=await resolveFirebaseUser(token,db),again=await resolveFirebaseUser(token,db);
  assert.equal(first.id,'firebase-a');
  assert.equal(again.id,first.id);
  assert.equal(db.documents.size,1);
});

test('a changed verified email updates only the same Firebase-owned document',async()=>{
  const db=fakeFirestore();
  await resolveFirebaseUser({uid:'firebase-a',email:'old@b.com',name:'A',email_verified:true},db);
  const user=await resolveFirebaseUser({uid:'firebase-a',email:'new@b.com',name:'A',email_verified:true},db);
  assert.equal(user.email,'new@b.com');
  assert.equal(db.documents.size,1);
});

test('disabled Firestore account cannot regain access with a valid identity',async()=>{
  const db=fakeFirestore();
  db.documents.set('users/firebase-a',{id:'firebase-a',disabled_at:'2026-01-01T00:00:00.000Z'});
  await assert.rejects(resolveFirebaseUser({uid:'firebase-a',email:'a@b.com',email_verified:true},db),/closed/);
});

test('dispatcher secrets and device inputs fail closed; push content is generic',()=>{
  assert.equal(dispatcherAuthorized(undefined,'x'.repeat(32)),false);
  assert.equal(dispatcherAuthorized('Bearer '+'x'.repeat(32),'x'.repeat(32)),true);
  assert.equal(dispatcherAuthorized('Bearer wrong','x'.repeat(32)),false);
  assert.equal(validPushToken('<script>'),false);assert.equal(validPushToken('a'.repeat(5000)),false);
  const payload=privatePushPayload({token:'abc',notification_id:'id',message:'secret',title:'secret'},'https://kubo.example');
  assert.equal(JSON.stringify(payload).includes('secret'),false);
});
