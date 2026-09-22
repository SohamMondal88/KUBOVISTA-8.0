import test from 'node:test';
import assert from 'node:assert/strict';
import { adsenseConfig } from '../scripts/adsense-config.mjs';
import { eligibleAdPath } from '../adsense.js';
test('unconfigured builds have no publisher or enabled slot', () => {
  assert.equal(adsenseConfig().head, '');
  assert.ok(!adsenseConfig().adsTxt.includes('DIRECT'));
});
test('verification works without activating advertising', () => {
  const config = adsenseConfig({ ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456' });
  assert.match(config.head, /google-adsense-account/);
  assert.match(config.head, /kubovistas-ad-slot" content=""/);
  assert.equal(config.adsTxt, 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
});
test('invalid IDs and incomplete activation fail closed', () => {
  assert.throws(() => adsenseConfig({ ADSENSE_PUBLISHER_ID: '"><script>' }));
  assert.throws(() => adsenseConfig({ ADSENSE_ENABLED: 'true' }));
  assert.throws(() => adsenseConfig({ ADSENSE_SLOT_ID: 'bad' }));
  assert.match(adsenseConfig({ ADSENSE_ENABLED: 'true', ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456', ADSENSE_SLOT_ID: '1234567890', ADSENSE_CONSENT_READY: 'true' }).head, /content="1234567890"/);
});
test('private, checkout, unknown and user-content routes never get placements', () => {
  for (const path of ['/checkout', '/login', '/profile', '/payments', '/planner', '/story/1', '/write', '/unknown', '/guide/unknown']) assert.equal(eligibleAdPath('#' + path), null);
  for (const path of ['/', '/destinations', '/guide']) assert.equal(eligibleAdPath('#' + path), path);
});
