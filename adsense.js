// Publisher bootstrap is in index.html; placements remain manual so sensitive routes stay ad-free.
import { notes } from './data.js';

const publicPages = new Set([
  '/', '/destinations', '/journeys', '/membership', '/company/about',
  '/legal', '/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/cancellation',
  '/legal/disclaimer', '/legal/accessibility', '/legal/grievance', '/legal/copyright',
  '/company/careers', '/company/sponsors', '/company/partnerships', '/company/stays', '/company/camping', '/company/contact'
]);
const guidePaths = new Set(notes.map(note => '/guides/' + note.id));
const requested = new Set();
let loading;

export function eligibleAdPath(value) {
  const raw=String(value||'/').replace(/^#/, '');
  const path = new URL(raw.startsWith('/')?raw:'/'+raw,'https://kubovista.com').pathname.replace(/\/+$/, '') || '/';
  if (publicPages.has(path) || guidePaths.has(path)) return path;
  // Destination details, account/checkout, UGC, admin, travel matching and unknown routes stay ad-free.
  return null;
}

function loadAds(publisher) {
  if (document.querySelector('script[src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + publisher + '"]')) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + publisher;
    script.onload = resolve;
    script.onerror = () => { script.remove(); loading = null; reject(new Error('Ads unavailable')); };
    document.head.append(script);
  });
  return loading;
}

export function mountAd(main) {
  const path = eligibleAdPath(location.pathname);
  const publisher = document.querySelector('meta[name="google-adsense-account"]')?.content;
  const slot = document.querySelector('meta[name="kubovistas-ad-slot"]')?.content;
  if (!path || requested.has(path) || !/^ca-pub-\d{16}$/.test(publisher || '') || !/^\d+$/.test(slot || '')) return;
  const region = document.createElement('aside');
  region.className = 'travel-ad wrap';
  region.setAttribute('aria-label', 'Advertisement');
  const label = document.createElement('p');
  label.textContent = 'Advertisement';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button outline';
  button.textContent = 'Load advertisement';
  const notice = document.createElement('p');
  notice.textContent = 'Loads Google advertising services. Advertising privacy choices are provided by our consent provider where applicable.';
  const policy = document.createElement('a');
  policy.href = '/legal/cookies';
  policy.textContent = 'Cookies & advertising';
  region.append(label, button, notice, policy);
  main.append(region);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await loadAds(publisher);
      if (!region.isConnected || eligibleAdPath(location.pathname) !== path) return;
      const ad = document.createElement('ins');
      ad.className = 'adsbygoogle';
      ad.style.display = 'block';
      ad.dataset.adClient = publisher;
      ad.dataset.adSlot = slot;
      ad.dataset.adFormat = 'auto';
      ad.dataset.fullWidthResponsive = 'true';
      region.replaceChildren(label, ad, policy);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      requested.add(path);
    } catch {
      notice.textContent = 'Advertising is unavailable. You can continue exploring the website.';
      button.remove();
    }
  }, { once: true });
}
