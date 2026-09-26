import test from 'node:test';
import assert from 'node:assert/strict';
import { adsenseConfig } from '../scripts/adsense-config.mjs';
import { eligibleAdPath } from '../adsense.js';
test('default build uses the supplied publisher without inventing a manual slot', () => {
  assert.match(adsenseConfig().head, /ca-pub-3851312120061760/);
  assert.match(adsenseConfig().head, /kubovistas-ad-slot" content=""/);
  assert.match(adsenseConfig().adsTxt, /pub-3851312120061760, DIRECT/);
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
test('manual placements cover public content and known guides, but skip destination details', () => {
  for (const path of ['/', '/destinations', '/journeys', '/membership', '/about', '/travel-date', '/contact', '/careers', '/guide/slow-travel', '/guide/mountain-packing']) {
    const expected = path === '/travel-date' ? null : path;
    assert.equal(eligibleAdPath('#' + path), expected);
  }
  for (const path of ['/destination/darjeeling', '/destination/goa', '/checkout', '/login', '/profile', '/payments', '/planner', '/story/1', '/write', '/unknown', '/guide/unknown', '/enquiry-inbox']) {
    assert.equal(eligibleAdPath('#' + path), null);
  }
});
test('route query strings and trailing slashes do not change eligible path matching', () => {
  assert.equal(eligibleAdPath('#/journeys?season=winter'), '/journeys');
  assert.equal(eligibleAdPath('#/journeys/'), '/journeys');
});
