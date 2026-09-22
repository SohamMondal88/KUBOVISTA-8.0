export function adsenseConfig(env = {}) {
  const publisher = (env.ADSENSE_PUBLISHER_ID || '').trim();
  const slot = (env.ADSENSE_SLOT_ID || '').trim();
  const enabled = env.ADSENSE_ENABLED === 'true';
  if (publisher && !/^ca-pub-\d{16}$/.test(publisher)) throw new Error('ADSENSE_PUBLISHER_ID must be ca-pub- followed by 16 digits');
  if (slot && !/^\d+$/.test(slot)) throw new Error('ADSENSE_SLOT_ID must contain digits only');
  if (enabled && (!publisher || !slot || env.ADSENSE_CONSENT_READY !== 'true')) {
    throw new Error('Enabling ads requires publisher ID, slot ID and ADSENSE_CONSENT_READY=true after consent setup');
  }
  return {
    head: publisher ? `<meta name="google-adsense-account" content="${publisher}">\n<meta name="kubovistas-ad-slot" content="${enabled ? slot : ''}">` : '',
    adsTxt: publisher ? `google.com, ${publisher.slice(3)}, DIRECT, f08c47fec0942fa0\n` : '# AdSense is not configured.\n'
  };
}
