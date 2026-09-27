const companyPages = new Set(['about','contact','careers','partnerships','sponsors','stays','camping','enquiry-inbox']);
const legalPages = new Set(['privacy','terms','cookies','cancellation','disclaimer','accessibility','grievance','copyright']);
const accountPages = new Set(['login','signup','verify-email','forgot-password','reset-password','welcome','dashboard','profile','bookings','booking','confirmation','thank-you','payments','payment','checkout','cancellation-request','notifications','settings','security','saved','admin','support']);
const journalTools = new Set(['write','my-stories','journal-review']);

export function canonicalPath(value = '/') {
  let raw = String(value || '/');
  if (raw.startsWith('#/')) raw = raw.slice(1);
  if (!raw.startsWith('/')) return raw;
  const url = new URL(raw, 'https://kubovista.com');
  const parts = url.pathname.split('/').filter(Boolean);
  const first = parts[0];
  let pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (first === 'destination') pathname = '/destinations/' + (parts[1] || '');
  else if (first === 'guide') pathname = '/guides' + (parts[1] ? '/' + parts[1] : '');
  else if (first === 'story') pathname = '/journal/' + (parts[1] || '');
  else if (journalTools.has(first)) pathname = '/journal/' + first + (parts[1] ? '/' + parts[1] : '');
  else if (companyPages.has(first)) pathname = '/company/' + first;
  else if (first === 'legal') pathname = '/legal';
  else if (legalPages.has(first)) pathname = '/legal/' + first;
  else if (accountPages.has(first)) pathname = '/account/' + first + (parts[1] ? '/' + parts.slice(1).join('/') : '');
  pathname = pathname.replace(/\/+$/, '') || '/';
  return pathname + url.search + url.hash;
}

export function routeParts(pathname = location.pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean);
  if (parts[0] === 'destinations' && parts[1]) return ['destination', parts[1]];
  if (parts[0] === 'guides') return ['guide', parts[1]].filter(Boolean);
  if (parts[0] === 'journal' && parts[1]) return journalTools.has(parts[1]) ? [parts[1],parts[2]].filter(Boolean) : ['story',parts[1]];
  if (parts[0] === 'company' && parts[1]) return [parts[1], parts[2]].filter(Boolean);
  if (parts[0] === 'legal' && parts[1]) return [parts[1], parts[2]].filter(Boolean);
  if (parts[0] === 'account' && parts[1]) return [parts[1], parts[2]].filter(Boolean);
  return parts;
}

export function navigate(value, { replace = false } = {}) {
  const path = canonicalPath(value);
  if (!path.startsWith('/')) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new Event('kubovistas:navigate'));
}

export function installNavigation() {
  window.kuboNavigate = value => navigate(value);
  if (location.hash.startsWith('#/')) navigate(location.hash, { replace: true });
  addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/')) navigate(location.hash, { replace: true });
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
}
