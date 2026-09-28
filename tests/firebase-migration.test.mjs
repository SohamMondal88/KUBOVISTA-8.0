import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { resolveFirebaseUser } from '../server/firebase-identity.js';
import { dispatcherAuthorized, privatePushPayload, validPushToken } from '../server/firebase-push.js';

async function database() {
  const db = new PGlite();
  for (const name of ['001_auth_accounts_payments.sql', '004_deposit_lifecycle.sql', '007_firebase_identity_push.sql', '008_checkout_integrity.sql']) {
    const sql = (await readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    await db.exec(sql);
  }
  return db;
}

test('unverified Firebase identity never creates a PostgreSQL account', async () => {
  const db = await database();
  try {
    await assert.rejects(resolveFirebaseUser({ uid: 'no', email: 'a@b.com', email_verified: false }, db), /Verify/);
    assert.equal((await db.query('SELECT * FROM "user"')).rows.length, 0);
  } finally { await db.close(); }
});

test('verified identity maps idempotently, preserves server role and updates its email', async () => {
  const db = await database();
  try {
    const token = { uid: 'firebase-a', email: 'a@b.com', name: 'A', email_verified: true };
    await resolveFirebaseUser(token, db);
    await db.query("UPDATE \"user\" SET role='operator' WHERE id=$1", [token.uid]);
    const again = await resolveFirebaseUser({ ...token, email: 'new@b.com' }, db);
    assert.equal(again.id, token.uid);
    assert.equal(again.email, 'new@b.com');
    assert.equal(again.role, 'operator');
    assert.equal((await db.query('SELECT * FROM "user"')).rows.length, 1);
  } finally { await db.close(); }
});

test('disabled PostgreSQL account cannot regain access with a valid Firebase identity', async () => {
  const db = await database();
  try {
    const token = { uid: 'firebase-a', email: 'a@b.com', email_verified: true };
    await resolveFirebaseUser(token, db);
    await db.query('UPDATE "user" SET disabled_at=now() WHERE id=$1', [token.uid]);
    await assert.rejects(resolveFirebaseUser(token, db), /closed/);
  } finally { await db.close(); }
});

test('dispatcher secrets and device inputs fail closed; push content is generic', () => {
  assert.equal(dispatcherAuthorized(undefined, 'x'.repeat(32)), false);
  assert.equal(dispatcherAuthorized('Bearer ' + 'x'.repeat(32), 'x'.repeat(32)), true);
  assert.equal(dispatcherAuthorized('Bearer wrong', 'x'.repeat(32)), false);
  assert.equal(validPushToken('<script>'), false);
  assert.equal(validPushToken('a'.repeat(5000)), false);
  const payload = privatePushPayload({ token: 'abc', notification_id: 'id', message: 'secret', title: 'secret' }, 'https://kubo.example');
  assert.equal(JSON.stringify(payload).includes('secret'), false);
});

test('explicit Firebase mapping preserves legacy account ownership and role', async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO "user" (id,firebase_uid,name,email,role) VALUES ('legacy','firebase-new','Traveler','old@example.com','operator')`);
    const user = await resolveFirebaseUser({uid:'firebase-new',email:'new@example.com',email_verified:true}, db);
    assert.equal(user.id, 'legacy');
    assert.equal(user.role, 'operator');
    assert.equal((await db.query('SELECT * FROM "user"')).rows.length, 1);
  } finally { await db.close(); }
});

test('matching email cannot silently claim a legacy account', async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO "user" (id,name,email) VALUES ('legacy','Traveler','same@example.com')`);
    await assert.rejects(resolveFirebaseUser({uid:'other',email:'same@example.com',email_verified:true}, db), {status:409});
    assert.equal((await db.query('SELECT firebase_uid FROM "user"')).rows[0].firebase_uid, null);
  } finally { await db.close(); }
});

test('checkout migration can run again without blocking later migrations', async () => {
  const db = await database();
  try {
    await db.exec(await readFile(new URL('../db/migrations/008_checkout_integrity.sql', import.meta.url),'utf8'));
  } finally { await db.close(); }
});
