export function adsenseConfig(env = {}) {
  const publisher = (env.ADSENSE_PUBLISHER_ID || 'ca-pub-3851312120061760').trim();
  const slot = (env.ADSENSE_SLOT_ID || '8921763854').trim();
  const requested = env.ADSENSE_ENABLED === 'true';
  if (publisher && !/^ca-pub-\d{16}$/.test(publisher)) throw new Error('ADSENSE_PUBLISHER_ID must be ca-pub- followed by 16 digits');
  if (slot && !/^\d+$/.test(slot)) throw new Error('ADSENSE_SLOT_ID must contain digits only');
  const enabled = requested && Boolean(publisher && slot) && env.ADSENSE_CONSENT_READY === 'true' && env.ADSENSE_CMP_VERIFIED === 'true' && env.ADSENSE_DASHBOARD_VERIFIED === 'true';
  const ampAccount = publisher ? '<meta name="google-adsense-account" content="' + publisher + '">' : '';
  const ampScripts = enabled ? [
    '<script async custom-element="amp-auto-ads" src="https://cdn.ampproject.org/v0/amp-auto-ads-0.1.js"></script>',
    '<script async custom-element="amp-ad" src="https://cdn.ampproject.org/v0/amp-ad-0.1.js"></script>'
  ].join('\n') : '';
  const ampBody = enabled ? [
    '<amp-auto-ads type="adsense" data-ad-client="' + publisher + '"></amp-auto-ads>',
    '<amp-ad width="100vw" height="320" type="adsense" data-ad-client="' + publisher + '" data-ad-slot="' + slot + '" data-auto-format="mcrspv" data-full-width=""><div overflow=""></div></amp-ad>'
  ].join('\n') : '';
  return {
    enabled,
    head: publisher ? '<meta name="google-adsense-account" content="' + publisher + '">\n<meta name="kubovistas-ad-slot" content="' + (enabled ? slot : '') + '">\n<meta name="kubovistas-ads-ready" content="' + (enabled ? 'true' : 'false') + '">' : '',
    adsTxt: publisher ? 'google.com, ' + publisher.slice(3) + ', DIRECT, f08c47fec0942fa0\n' : '# AdSense is not configured.\n',
    ampAccount,
    ampScripts,
    ampBody
  };
}
