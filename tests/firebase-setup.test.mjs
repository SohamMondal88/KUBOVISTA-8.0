import test from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { getFirebaseAdmin } from '../server/firebase-admin.js';
import { firebaseConfig, vapidKey } from '../client/firebase-config.js';

test('Admin SDK import does not initialize privileged services', () => {
  assert.equal(getApps().some(app => app.name === 'kubovistas-admin'), false);
});
test('partial Admin credentials fail closed with a non-secret error', () => {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY;
  try {
    process.env.FIREBASE_CLIENT_EMAIL = 'test@example.invalid';
    delete process.env.FIREBASE_PRIVATE_KEY;
    assert.throws(() => getFirebaseAdmin(), /requires both client email and private key/);
  } finally {
    if (email === undefined) delete process.env.FIREBASE_CLIENT_EMAIL; else process.env.FIREBASE_CLIENT_EMAIL = email;
    if (key === undefined) delete process.env.FIREBASE_PRIVATE_KEY; else process.env.FIREBASE_PRIVATE_KEY = key;
  }
});
test('public Firebase config points to the supplied project and public web push key', () => {
  assert.equal(firebaseConfig.projectId, 'kubovistas-6666');
  assert.equal(firebaseConfig.measurementId, 'G-XNM7K6BGHR');
  assert.equal(Buffer.from(vapidKey, 'base64url').length, 65);
  assert.equal(Object.keys(firebaseConfig).some(key => /private|credential/i.test(key)), false);
});
