import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldApplyCapture } from '../server/payment-state.js';
import { validateDepartureDate } from '../server/booking-validation.js';

test('Vercel static analytics injection resolves without breaking native modules', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const shim=await readFile(new URL('../vercel-analytics.js',import.meta.url),'utf8');
  assert.match(html,/"@vercel\/analytics":"\/vercel-analytics\.js"/);
  assert.match(shim,/export function inject\(\)/);
});

test('authorization followed by capture applies the booking transition once', () => {
  assert.equal(shouldApplyCapture('created', 'authorized'), false);
  assert.equal(shouldApplyCapture('authorized', 'captured'), true);
  assert.equal(shouldApplyCapture('captured', 'captured'), false);
});
test('capture retries cannot resurrect a refunded payment', () => {
  for (const status of ['refunded', 'refund_pending']) assert.equal(shouldApplyCapture(status, 'captured'), false);
  assert.equal(shouldApplyCapture('failed', 'captured'), true);
});
test('flexible departure stays optional and future calendar dates are accepted', () => {
  assert.equal(validateDepartureDate('', '2026-09-24'), null);
  assert.equal(validateDepartureDate(undefined, '2026-09-24'), null);
  assert.equal(validateDepartureDate('2026-09-24', '2026-09-24'), '2026-09-24');
  assert.equal(validateDepartureDate('2028-02-29', '2026-09-24'), '2028-02-29');
});
test('invalid dates and past dates are rejected before PostgreSQL insertion', () => {
  for (const value of ['2026-02-30', '2026-09-23', '2026-13-01', 'tomorrow', [], '2026-09-24T00:00:00Z']) {
    assert.throws(() => validateDepartureDate(value, '2026-09-24'), /departure date/);
  }
});

test('P2 route and authentication regressions stay removed', async () => {
  const [app,auth,build,html,account,serverAuth,identity]=await Promise.all([
    readFile(new URL('../app.js',import.meta.url),'utf8'),
    readFile(new URL('../client/firebase-auth.js',import.meta.url),'utf8'),
    readFile(new URL('../scripts/build-firebase.mjs',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../account.js',import.meta.url),'utf8'),
    readFile(new URL('../server/auth.js',import.meta.url),'utf8'),
    readFile(new URL('../server/firebase-identity.js',import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(app,/ACCOUNT SERVICE/);
  assert.match(app,/data-retry-route/);
  for(const module of ['account','growth-ui','packages-ui','membership','travel-date','journal','company'])assert.match(app,new RegExp(`import\\(["']\\./${module}\\.js["']\\)`));
  assert.doesNotMatch(auth,/RecaptchaVerifier|signInWithPhoneNumber|startPhoneSignIn|confirmPhoneSignIn/);
  assert.doesNotMatch(build,/firebase-firestore-client|client\/firestore\.js/);
  assert.doesNotMatch(html,/accounts\.google\.com\/gsi\/client|googletagmanager\.com\/gtag\/js/);
  assert.match(account,/location\.origin}\/account\/reset-password/);
  assert.doesNotMatch(account,/location\.origin}\/\/reset-password/);
  assert.match(auth,/failure\.code = data\.code \|\| "account-service-unavailable"/);
  assert.match(serverAuth,/code: error\.code \|\| "account-service-unavailable"/);
  assert.match(identity,/account-schema-outdated/);
});
