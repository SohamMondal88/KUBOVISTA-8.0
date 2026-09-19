import { destinations } from './data.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(paise || 0) / 100);
const date = value => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Flexible';
const initials = name => String(name || 'Traveler').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

let configCache;
let sessionCache;

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error?.message || data.error || data.message || `Request failed (${response.status}).`);
  return data;
}

async function getConfig() {
  if (configCache) return configCache;
  try { configCache = await request('/api/config'); }
  catch { configCache = { auth: false, database: false, emailVerification: false, google: false, payments: false, paymentProvider: 'Razorpay', currency: 'INR', advancePercent: 25 }; }
  return configCache;
}

export async function getAccountSession(force = false) {
  if (!force && sessionCache !== undefined) return sessionCache;
  if (!(await getConfig()).auth) { sessionCache=null; return null; }
  try { sessionCache = await request('/api/auth/get-session'); }
  catch { sessionCache = null; }
  return sessionCache;
}

export async function syncAccountButton() {
  const button = document.querySelector('#account-button');
  if (!button) return;
  const session = await getAccountSession();
  if (session?.user) {
    button.href = '#/dashboard';
    button.setAttribute('aria-label', 'Open your account');
    button.innerHTML = `<span class="account-avatar">${escapeHTML(initials(session.user.name))}</span><span class="account-label">${escapeHTML(session.user.name.split(' ')[0])}</span>`;
  } else {
    button.href = '#/login';
    button.setAttribute('aria-label', 'Sign in to KUBOVISTA');
    button.innerHTML = '<span class="account-avatar" aria-hidden="true">◎</span><span class="account-label">Sign in</span>';
  }
}

function setupNotice(config) {
  if (config.auth) return '';
  return `<div class="setup-notice" role="status"><strong>Secure account setup required</strong><p>Accounts are not available yet. Please return shortly.</p><a href="https://github.com/SohamMondal88/KUBOVISTA-8.0/blob/main/SETUP_AUTH_PAYMENTS.md" target="_blank" rel="noopener noreferrer">Open setup guide ↗</a></div>`;
}

function authLayout(kicker, title, copy, content, config) {
  return `<section class="auth-page"><div class="auth-story"><a class="back-link" href="#/">← Back home</a><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${copy}</p><div class="auth-proof"><span><b>01</b> Your plans, together</span><span><b>02</b> Secure quotation payments</span><span><b>03</b> Support that remembers</span></div></div><div class="auth-panel">${setupNotice(config)}${content}<p class="auth-legal">By continuing, you acknowledge the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>.</p></div></section>`;
}

function field(label, name, type = 'text', options = '') {
  return `<label>${label}<input name="${name}" type="${type}" ${options}></label>`;
}

async function signInPage(main, config, toast) {
  main.innerHTML = authLayout('WELCOME BACK', 'Continue your<br><em>next chapter.</em>', 'Sign in to keep consultation requests, quotations and payments in one calm place.', `<span class="eyebrow green">TRAVELER SIGN IN</span><h2>Good to see you.</h2><form id="login-form" class="account-form">${field('Email address', 'email', 'email', 'autocomplete="email" required')}${field('Password', 'password', 'password', 'autocomplete="current-password" minlength="10" required')}<div class="form-between"><label class="check-row"><input name="rememberMe" type="checkbox" checked> Keep me signed in</label><a href="#/forgot-password">Forgot password?</a></div><button class="button" type="submit" ${config.auth ? '' : 'disabled'}>Sign in securely ↗</button><p class="form-status" role="status"></p></form>${config.google ? '<button class="social-button" id="google-auth">Continue with Google</button>' : ''}<p class="auth-switch">New to KUBOVISTA? <a href="#/signup">Create an account</a></p>`, config);
  const form = document.querySelector('#login-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type=submit]');
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true; status.textContent = 'Signing you in…';
    try {
      await request('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: values.email, password: values.password, rememberMe: Boolean(values.rememberMe), callbackURL: `${location.origin}/#/dashboard` }) });
      sessionCache = undefined; await syncAccountButton(); toast('Welcome back.');
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      const next=params.get('return'); location.hash = next && /^\/(dashboard|planner|profile|bookings|booking|payments|settings|security)(?:[/?]|$)/.test(next) ? next : '/dashboard';
    } catch (error) { status.textContent = error.message; button.disabled = !config.auth; }
  });
  document.querySelector('#google-auth')?.addEventListener('click', async () => {
    try { const data = await request('/api/auth/sign-in/social', { method: 'POST', body: JSON.stringify({ provider: 'google', callbackURL: `${location.origin}/#/dashboard` }) }); if (data.url) location.href = data.url; }
    catch (error) { toast(error.message); }
  });
}

async function signUpPage(main, config, toast) {
  main.innerHTML = authLayout('CREATE YOUR ACCOUNT', 'Travel plans.<br><em>One private place.</em>', 'Build a profile, request a consultation and pay only against a reviewed quotation.', `<span class="eyebrow green">NEW TRAVELER</span><h2>Start somewhere.</h2><form id="signup-form" class="account-form">${field('Full name', 'name', 'text', 'autocomplete="name" maxlength="80" required')}${field('Email address', 'email', 'email', 'autocomplete="email" required')}${field('Create password', 'password', 'password', 'autocomplete="new-password" minlength="10" required')}<div class="password-hint"><span>10+ characters</span><span>Use a unique password</span></div><label class="check-row"><input name="terms" type="checkbox" required> I agree to the Terms and acknowledge the Privacy Policy.</label><button class="button" type="submit" ${config.auth ? '' : 'disabled'}>Create my account ↗</button><p class="form-status" role="status"></p></form>${config.google ? '<button class="social-button" id="google-auth">Sign up with Google</button>' : ''}<p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>`, config);
  const form = document.querySelector('#signup-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const status = form.querySelector('.form-status'); const button = form.querySelector('button[type=submit]');
    button.disabled = true; status.textContent = 'Creating your account…';
    try {
      await request('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ name: values.name, email: values.email, password: values.password, callbackURL: `${location.origin}/#/welcome` }) });
      sessionCache = undefined;
      if (config.emailVerification) { location.hash = `/verify-email?email=${encodeURIComponent(values.email)}`; }
      else { await syncAccountButton(); location.hash = '/welcome'; }
    } catch (error) { status.textContent = error.message; button.disabled = !config.auth; }
  });
  document.querySelector('#google-auth')?.addEventListener('click', async () => {
    try { const data = await request('/api/auth/sign-in/social', { method: 'POST', body: JSON.stringify({ provider: 'google', callbackURL: `${location.origin}/#/welcome`, newUserCallbackURL: `${location.origin}/#/welcome` }) }); if (data.url) location.href = data.url; }
    catch (error) { toast(error.message); }
  });
}

async function forgotPage(main, config) {
  main.innerHTML = authLayout('PASSWORD RECOVERY', 'A small reset.<br><em>Then onward.</em>', 'Enter the email used for your account. If it exists, we will send a secure reset link.', `<span class="eyebrow green">RESET PASSWORD</span><h2>Find your way back.</h2><form id="forgot-form" class="account-form">${field('Email address', 'email', 'email', 'autocomplete="email" required')}<button class="button" type="submit" ${config.auth ? '' : 'disabled'}>Send reset link ↗</button><p class="form-status" role="status"></p></form><p class="auth-switch"><a href="#/login">← Return to sign in</a></p>`, config);
  const form = document.querySelector('#forgot-form');
  form.addEventListener('submit', async event => {
    event.preventDefault(); const status = form.querySelector('.form-status'); const button = form.querySelector('button'); button.disabled = true;
    try { const email = new FormData(form).get('email'); await request('/api/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo: `${location.origin}/#/reset-password` }) }); status.textContent = 'If an account matches that email, a reset link is on its way.'; }
    catch (error) { status.textContent = error.message; button.disabled = !config.auth; }
  });
}

async function resetPage(main, config) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const token = params.get('token') || new URLSearchParams(location.search).get('token') || '';
  main.innerHTML = authLayout('NEW PASSWORD', 'Secure again.<br><em>Ready again.</em>', 'Choose a fresh password that you do not reuse on another service.', `<span class="eyebrow green">PASSWORD RESET</span><h2>Choose a new password.</h2>${token ? `<form id="reset-form" class="account-form">${field('New password', 'password', 'password', 'autocomplete="new-password" minlength="10" required')}${field('Confirm new password', 'confirmPassword', 'password', 'autocomplete="new-password" minlength="10" required')}<button class="button" type="submit" ${config.auth ? '' : 'disabled'}>Update password ↗</button><p class="form-status" role="status"></p></form>` : '<div class="empty-inline"><h3>This reset link is incomplete.</h3><p>Request a fresh password-reset email to continue.</p><a class="button" href="#/forgot-password">Request new link</a></div>'}`, config);
  const form = document.querySelector('#reset-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const status = form.querySelector('.form-status');
    if (values.password !== values.confirmPassword) { status.textContent = 'The passwords do not match.'; return; }
    try { await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ newPassword: values.password, token }) }); status.textContent = 'Password updated. You can sign in now.'; setTimeout(() => { location.hash = '/login'; }, 900); }
    catch (error) { status.textContent = error.message; }
  });
}

function verifyPage(main, config) {
  const email = new URLSearchParams(location.hash.split('?')[1] || '').get('email');
  main.innerHTML = authLayout('CHECK YOUR INBOX', 'One click.<br><em>Then you’re in.</em>', 'Email verification protects your itinerary, quotation and payment history.', `<div class="auth-icon">✦</div><h2>Verify your email.</h2><p class="panel-copy">We sent a verification link${email ? ` to <strong>${escapeHTML(email)}</strong>` : ''}. Open it on this device to continue.</p><button class="button outline" id="resend-verification" ${config.emailVerification && email ? '' : 'disabled'}>Send another link</button><p class="form-status" role="status"></p><p class="auth-switch"><a href="#/login">Return to sign in</a></p>`, config);
  document.querySelector('#resend-verification')?.addEventListener('click', async event => {
    try { event.currentTarget.disabled = true; await request('/api/auth/send-verification-email', { method: 'POST', body: JSON.stringify({ email, callbackURL: `${location.origin}/#/dashboard` }) }); document.querySelector('.form-status').textContent = 'A fresh verification link has been sent.'; }
    catch (error) { document.querySelector('.form-status').textContent = error.message; event.currentTarget.disabled = false; }
  });
}

const accountNav = active => `<nav class="account-nav" aria-label="Your account"><a href="#/dashboard" ${active === 'dashboard' ? 'aria-current="page"' : ''}>Overview</a><a href="#/bookings" ${active === 'bookings' ? 'aria-current="page"' : ''}>Trips & quotes</a><a href="#/payments" ${active === 'payments' ? 'aria-current="page"' : ''}>Payments</a><a href="#/profile" ${active === 'profile' ? 'aria-current="page"' : ''}>Profile</a><a href="#/notifications" ${active === 'notifications' ? 'aria-current="page"' : ''}>Updates</a><a href="#/settings" ${active === 'settings' ? 'aria-current="page"' : ''}>Settings</a><a href="#/security" ${active === 'security' ? 'aria-current="page"' : ''}>Security</a><a href="#/saved">Saved places</a><a href="#/support">Support</a></nav>`;

function shell(main, active, session, title, intro, content) {
  main.innerHTML = `<section class="account-page wrap"><div class="account-heading"><div><span class="eyebrow green">YOUR KUBOVISTA</span><h1>${title}</h1><p>${intro}</p></div><div class="account-identity"><span>${escapeHTML(initials(session.user.name))}</span><div><strong>${escapeHTML(session.user.name)}</strong><small>${escapeHTML(session.user.email)}</small></div></div></div>${accountNav(active)}<div class="account-content">${content}</div></section>`;
}

function authRequired(main) {
  main.innerHTML = `<section class="account-required wrap"><span class="eyebrow green">PRIVATE TRAVELER AREA</span><h1>Sign in to keep<br><em>your plans together.</em></h1><p>Your profile, trip requests, quotations and payment history live behind your secure account.</p><div><a class="button" href="#/login?return=${encodeURIComponent(location.hash.slice(1))}">Sign in ↗</a><a class="button outline" href="#/signup">Create account</a></div></section>`;
}

function statusPill(status) {
  return `<span class="status-pill status-${escapeHTML(status)}">${escapeHTML(String(status).replaceAll('_', ' '))}</span>`;
}

function bookingCard(item) {
  const due = item.quote_total_paise ? Math.round(Number(item.quote_total_paise) * Number(item.advance_percent) / 100) : 0;
  return `<a class="booking-card" href="#/booking/${item.id}"><div><span class="eyebrow green">${date(item.created_at)}</span><h3>${escapeHTML(item.destination_name)}</h3><p>${item.days} days · ${item.travelers} ${item.travelers === 1 ? 'traveler' : 'travelers'} · ${escapeHTML(item.travel_style)}</p></div><div>${statusPill(item.status)}${due ? `<strong>${money(due)} advance</strong>` : '<strong>Expert review</strong>'}<span>Open trip ↗</span></div></a>`;
}

async function dashboardPage(main, session) {
  const [bookingsData, paymentsData, noticesData] = await Promise.all([request('/api/bookings'), request('/api/payments'), request('/api/notifications')]);
  const capability=await request('/api/profile');
  const bookings = bookingsData.bookings || []; const payments = paymentsData.payments || []; const notices = noticesData.notifications || [];
  const next = bookings.find(item => ['quotation_ready', 'advance_paid', 'confirmed'].includes(item.status));
  shell(main, 'dashboard', session, `Good to see you,<br><em>${escapeHTML(session.user.name.split(' ')[0])}.</em>`, 'Your trips, quotations and account details—without the clutter.', `${capability.admin?'<p class="notice"><a href="#/admin">Open quotation management ↗</a></p>':''}<section class="account-stats"><div><span>Trip requests</span><strong>${bookings.length}</strong></div><div><span>Active quotation</span><strong>${bookings.filter(item => item.status === 'quotation_ready').length}</strong></div><div><span>Payments</span><strong>${payments.length}</strong></div><div><span>Unread updates</span><strong>${notices.filter(item => !item.read_at).length}</strong></div></section>${next ? `<section class="next-trip"><div><span class="eyebrow">NEXT IN YOUR STORY</span><h2>${escapeHTML(next.destination_name)}</h2><p>${next.days} thoughtful days · ${next.travelers} travelers</p><a class="button" href="#/booking/${next.id}">Review this trip ↗</a></div><div>${statusPill(next.status)}<span>${next.departure_date ? date(next.departure_date) : 'Dates are flexible'}</span></div></section>` : `<section class="empty-account"><span>↗</span><h2>Your first chapter starts here.</h2><p>Build a trip brief, then send it for a personal consultation.</p><a class="button" href="#/planner">Start planning ↗</a></section>`}<section class="account-split"><div><div class="account-section-title"><h2>Recent requests</h2><a href="#/bookings">View all ↗</a></div>${bookings.slice(0, 3).map(bookingCard).join('') || '<p class="muted-copy">No consultation requests yet.</p>'}</div><aside class="account-updates"><div class="account-section-title"><h2>Updates</h2><a href="#/notifications">Open all ↗</a></div>${notices.slice(0, 4).map(item => `<article class="update-item ${item.read_at ? '' : 'unread'}"><span>${escapeHTML(item.kind)}</span><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.message)}</p></article>`).join('') || '<p class="muted-copy">You are all caught up.</p>'}</aside></section>`);
}

async function profilePage(main, session, toast, welcome = false) {
  const data = await request('/api/profile'); const p = data.profile || {};
  shell(main, 'profile', session, welcome ? 'Tell us how<br><em>you travel.</em>' : 'Your traveler<br><em>profile.</em>', welcome ? 'A few details help an expert shape a more thoughtful consultation.' : 'Keep the details used to personalise your consultation current.', `<form id="profile-form" class="profile-form"><section><span class="eyebrow green">THE BASICS</span><div class="profile-avatar">${escapeHTML(initials(p.display_name || session.user.name))}</div><div class="form-grid">${field('Display name', 'displayName', 'text', `value="${escapeHTML(p.display_name || session.user.name)}" maxlength="80" required`)}${field('Phone number', 'phone', 'tel', `value="${escapeHTML(p.phone || '')}" autocomplete="tel" maxlength="24"`)}</div><div class="form-grid">${field('City', 'city', 'text', `value="${escapeHTML(p.city || '')}" maxlength="80"`)}${field('State', 'state', 'text', `value="${escapeHTML(p.state || '')}" maxlength="80"`)}</div>${field('Country', 'country', 'text', `value="${escapeHTML(p.country || 'India')}" maxlength="80"`)}</section><section><span class="eyebrow green">YOUR TRAVEL RHYTHM</span><label>Preferred travel style<select name="travelStyle">${['Slow & scenic','Culture & connection','Nature & walking','Friends & adventure','Family time'].map(style => `<option ${p.travel_style === style ? 'selected' : ''}>${style}</option>`).join('')}</select></label><label>A little about you<textarea name="bio" maxlength="400" placeholder="The places, pace or experiences you enjoy…">${escapeHTML(p.bio || '')}</textarea></label><label>Accessibility or support notes <span class="optional">Optional</span><textarea name="accessibilityNotes" maxlength="500" placeholder="Share only what helps us plan a more comfortable trip.">${escapeHTML(p.accessibility_notes || '')}</textarea></label></section><section><span class="eyebrow green">EMERGENCY CONTACT · OPTIONAL</span><p class="field-note">Add this only when useful for a consultation. It is personal data and should be kept accurate.</p><div class="form-grid">${field('Contact name', 'emergencyContactName', 'text', `value="${escapeHTML(p.emergency_contact_name || '')}" maxlength="100"`)}${field('Contact phone', 'emergencyContactPhone', 'tel', `value="${escapeHTML(p.emergency_contact_phone || '')}" maxlength="24"`)}</div></section><div class="sticky-form-action"><p class="form-status" role="status"></p><button class="button" type="submit">Save profile ↗</button></div></form>`);
  const form = document.querySelector('#profile-form');
  form.addEventListener('submit', async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const status = form.querySelector('.form-status'); status.textContent = 'Saving…';
    try { await request('/api/profile', { method: 'PUT', body: JSON.stringify(values) }); sessionCache = undefined; await syncAccountButton(); toast('Your profile has been updated.'); if (welcome) location.hash = '/dashboard'; else status.textContent = 'Saved.'; }
    catch (error) { status.textContent = error.message; }
  });
}

async function settingsPage(main, session, toast) {
  const { settings: s } = await request('/api/settings');
  shell(main, 'settings', session, 'Settings that<br><em>feel like you.</em>', 'Choose how KUBOVISTA communicates and how your traveler profile behaves.', `<form id="settings-form" class="settings-form"><section><span class="eyebrow green">COMMUNICATION</span>${[['emailTripUpdates','Trip and quotation updates','Essential progress messages about requests and payments.',s.email_trip_updates],['emailOffers','Destination inspiration','Occasional guides and offers. Off by default.',s.email_offers],['productUpdates','Product updates','Important changes to KUBOVISTA features.',s.product_updates]].map(([name,title,copy,checked])=>`<label class="setting-row"><span><strong>${title}</strong><small>${copy}</small></span><input type="checkbox" name="${name}" ${checked?'checked':''}></label>`).join('')}</section><section><span class="eyebrow green">PRIVACY & PREFERENCES</span><label>Profile visibility<select name="profileVisibility"><option value="private" ${s.profile_visibility==='private'?'selected':''}>Private</option><option value="companions" ${s.profile_visibility==='companions'?'selected':''}>Visible to approved trip companions</option></select></label><div class="form-grid"><label>Preferred language<select name="preferredLanguage">${['English','বাংলা','हिन्दी'].map(v=>`<option ${s.preferred_language===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Currency<select name="preferredCurrency"><option>INR</option></select></label></div><a class="underlined" href="#/privacy">Read the Privacy Policy ↗</a></section><div class="sticky-form-action"><p class="form-status" role="status"></p><button class="button" type="submit">Save settings ↗</button></div></form>`);
  const form=document.querySelector('#settings-form');form.addEventListener('submit',async event=>{event.preventDefault();const fd=new FormData(form);const payload={emailTripUpdates:fd.has('emailTripUpdates'),emailOffers:fd.has('emailOffers'),productUpdates:fd.has('productUpdates'),profileVisibility:fd.get('profileVisibility'),preferredLanguage:fd.get('preferredLanguage'),preferredCurrency:fd.get('preferredCurrency')};const status=form.querySelector('.form-status');status.textContent='Saving…';try{await request('/api/settings',{method:'PUT',body:JSON.stringify(payload)});status.textContent='Saved.';toast('Your settings have been updated.');}catch(error){status.textContent=error.message;}});
}

async function bookingsPage(main, session) {
  const { bookings } = await request('/api/bookings');
  shell(main, 'bookings', session, 'Trips, quotes<br><em>& possibilities.</em>', 'Follow every consultation request from first idea to confirmed journey.', `<div class="account-toolbar"><span>${bookings.length} ${bookings.length===1?'trip request':'trip requests'}</span><a class="button small" href="#/planner">Plan another trip ↗</a></div><div class="booking-list">${bookings.map(bookingCard).join('') || '<section class="empty-account"><span>◇</span><h2>No trip requests yet.</h2><p>Create a personal trip brief and send it for expert review.</p><a class="button" href="#/planner">Build a trip brief ↗</a></section>'}</div>`);
}

async function bookingDetailPage(main, session, id) {
  const { booking: b } = await request(`/api/bookings?id=${encodeURIComponent(id)}`);
  const due = b.quote_total_paise ? Math.round(Number(b.quote_total_paise)*Number(b.advance_percent)/100) : 0;
  shell(main, 'bookings', session, `${escapeHTML(b.destination_name)}<br><em>in the making.</em>`, 'Your consultation request, quotation and next action in one place.', `<a class="back-link" href="#/bookings">← All trips & quotations</a><div class="booking-detail"><section><div class="booking-detail-head"><div><span class="eyebrow green">REQUEST ${escapeHTML(b.id.slice(0,8).toUpperCase())}</span><h2>${escapeHTML(b.destination_name)}</h2></div>${statusPill(b.status)}</div><dl class="detail-list"><div><dt>Duration</dt><dd>${b.days} days</dd></div><div><dt>Travelers</dt><dd>${b.travelers}</dd></div><div><dt>Travel style</dt><dd>${escapeHTML(b.travel_style)}</dd></div><div><dt>Preferred departure</dt><dd>${date(b.departure_date)}</dd></div><div><dt>Your budget target</dt><dd>${money(Number(b.budget_per_person_paise)*b.travelers)}</dd></div><div><dt>Requested</dt><dd>${date(b.created_at)}</dd></div></dl>${b.notes?`<div class="traveler-note"><span>YOUR NOTE</span><p>${escapeHTML(b.notes)}</p></div>`:''}</section><aside class="quote-card ${b.status==='quotation_ready'?'ready':''}"><span class="eyebrow">${b.quote_total_paise?'YOUR QUOTATION':'EXPERT REVIEW'}</span>${b.quote_total_paise?`<h2>${money(b.quote_total_paise)}</h2><p>Total quoted trip price for the confirmed scope.</p><dl><div><dt>Advance</dt><dd>${b.advance_percent}%</dd></div><div><dt>Due now</dt><dd>${money(due)}</dd></div><div><dt>Valid until</dt><dd>${date(b.quote_expires_at)}</dd></div></dl>${b.quote_notes?`<p class="quote-note">${escapeHTML(b.quote_notes)}</p>`:''}${b.status==='quotation_ready'?`<a class="button" href="#/checkout/${b.id}">Pay secure advance ↗</a>`:`<a class="button outline" href="#/payments">View payment record</a>`}`:`<h2>We’re shaping the details.</h2><p>A travel expert will review your dates, pace and budget before sharing an itemised quotation. No payment is requested yet.</p><div class="quote-steps"><span class="done">Request received</span><span>Expert consultation</span><span>Quotation ready</span><span>Secure advance</span></div>`}<small>Payments are requested only against a reviewed quotation.</small></aside></div>`);
}

async function paymentsPage(main, session) {
  const { payments } = await request('/api/payments');
  shell(main, 'payments', session, 'Payments,<br><em>clearly recorded.</em>', 'Every secure advance linked to its quotation and trip request.', `<div class="payment-list">${payments.map(p=>`<article class="payment-row"><div><span class="eyebrow green">${date(p.created_at)}</span><h3>${escapeHTML(p.destination_name)}</h3><p>Order ${escapeHTML(p.razorpay_order_id)}</p></div><div>${statusPill(p.status)}<strong>${money(p.amount_paise)}</strong><small>${p.razorpay_payment_id?`Payment ${escapeHTML(p.razorpay_payment_id)}`:'Awaiting payment'}</small></div></article>`).join('')||'<section class="empty-account"><span>₹</span><h2>No payments yet.</h2><p>You will only see a payment request after an expert shares a valid quotation.</p><a class="button" href="#/bookings">View trip requests ↗</a></section>'}</div><div class="payment-assurance"><strong>Secure by design</strong><p>Card, UPI and banking credentials are entered in Razorpay Checkout—not stored by KUBOVISTA. Order amounts are calculated on the server from your accepted quotation.</p><a href="#/cancellation">Cancellation & refund policy ↗</a></div>`);
}

async function notificationsPage(main, session, toast) {
  const { notifications } = await request('/api/notifications');
  shell(main, 'notifications', session, 'The latest from<br><em>your journey.</em>', 'Consultation, quotation, payment and account updates.', `<div class="account-toolbar"><span>${notifications.filter(n=>!n.read_at).length} unread</span>${notifications.length?'<button class="text-button" id="read-all">Mark all as read</button>':''}</div><div class="notification-list">${notifications.map(n=>`<button class="notification-card ${n.read_at?'':'unread'}" data-notification="${n.id}"><span class="notification-mark"></span><div><small>${escapeHTML(n.kind)} · ${date(n.created_at)}</small><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.message)}</p></div></button>`).join('')||'<section class="empty-account"><span>✓</span><h2>You’re all caught up.</h2><p>New trip and account updates will appear here.</p></section>'}</div>`);
  document.querySelector('#read-all')?.addEventListener('click',async()=>{await request('/api/notifications',{method:'PATCH',body:'{}'});toast('All updates marked as read.');notificationsPage(main,session,toast);});
  document.querySelectorAll('[data-notification]').forEach(button=>button.addEventListener('click',async()=>{await request('/api/notifications',{method:'PATCH',body:JSON.stringify({id:button.dataset.notification})});button.classList.remove('unread');}));
}

async function securityPage(main, session, toast) {
  let sessions=[];try{const data=await request('/api/auth/list-sessions');sessions=Array.isArray(data)?data:[];}catch{}
  shell(main, 'security', session, 'Account security,<br><em>in your hands.</em>', 'Change your password, inspect sessions and control your account.', `<div class="security-grid"><section><span class="eyebrow green">PASSWORD</span><h2>Change password</h2><form id="password-form" class="account-form">${field('Current password','currentPassword','password','autocomplete="current-password" required')}${field('New password','newPassword','password','autocomplete="new-password" minlength="10" required')}<label class="check-row"><input name="revoke" type="checkbox" checked> Sign out other devices</label><button class="button" type="submit">Update password</button><p class="form-status" role="status"></p></form></section><section><span class="eyebrow green">ACTIVE SESSIONS</span><h2>Your devices</h2><div class="session-list">${sessions.map(item=>`<div><span>◉</span><div><strong>${escapeHTML(item.userAgent||'Current browser')}</strong><small>${item.ipAddress?escapeHTML(item.ipAddress):'Protected session'} · expires ${date(item.expiresAt)}</small></div>${item.token!==session.session?.token?`<button data-revoke="${escapeHTML(item.token)}">Revoke</button>`:'<b>Current</b>'}</div>`).join('')||'<p class="muted-copy">Session details are unavailable in this environment.</p>'}</div><button class="button outline" id="signout-account">Sign out this device</button></section><section class="danger-zone"><span class="eyebrow">DANGER ZONE</span><h2>Delete account</h2><p>This permanently removes the account and connected KUBOVISTA profile data. Financial records may need to be retained where required by law.</p><button class="text-button danger" id="delete-account">Delete my account</button></section></div><dialog id="delete-dialog" class="confirm-dialog"><button class="dialog-close icon-button" aria-label="Close account deletion">✕</button><span class="eyebrow">PERMANENT ACTION</span><h2>Delete your account?</h2><p>Enter your password and type DELETE. This action cannot be undone.</p><form id="delete-form" class="account-form">${field('Current password','password','password','autocomplete="current-password" required')}${field('Type DELETE','confirmation','text','autocomplete="off" pattern="DELETE" required')}<button class="button danger-button" type="submit">Permanently delete account</button><p class="form-status" role="status"></p></form></dialog>`);
  const passwordForm=document.querySelector('#password-form');passwordForm.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(passwordForm));const status=passwordForm.querySelector('.form-status');try{await request('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:values.currentPassword,newPassword:values.newPassword,revokeOtherSessions:Boolean(values.revoke)})});passwordForm.reset();status.textContent='Password updated.';toast('Your password has been changed.');}catch(error){status.textContent=error.message;}});
  document.querySelectorAll('[data-revoke]').forEach(button=>button.addEventListener('click',async()=>{try{await request('/api/auth/revoke-session',{method:'POST',body:JSON.stringify({token:button.dataset.revoke})});button.closest('div').remove();toast('Session revoked.');}catch(error){toast(error.message);}}));
  document.querySelector('#signout-account').addEventListener('click',()=>signOut(toast));
  const dialog=document.querySelector('#delete-dialog');document.querySelector('#delete-account').addEventListener('click',()=>dialog.showModal());dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.querySelector('#delete-form').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));const status=event.currentTarget.querySelector('.form-status');if(values.confirmation!=='DELETE'){status.textContent='Type DELETE exactly.';return;}try{await request('/api/auth/delete-user',{method:'POST',body:JSON.stringify({password:values.password,callbackURL:`${location.origin}/#/`})});sessionCache=null;location.hash='/';}catch(error){status.textContent=error.message;}});
}

async function checkoutPage(main, session, id, toast) {
  const [config,{booking:b}]=await Promise.all([getConfig(),request(`/api/bookings?id=${encodeURIComponent(id)}`)]);const due=b.quote_total_paise?Math.round(Number(b.quote_total_paise)*Number(b.advance_percent)/100):0;
  shell(main, 'payments', session, 'Secure<br><em>advance payment.</em>', 'Review the quotation summary before opening Razorpay Checkout.', `<div class="checkout-layout"><section class="checkout-summary"><span class="eyebrow green">QUOTATION SUMMARY</span><h2>${escapeHTML(b.destination_name)}</h2><dl><div><dt>Trip total</dt><dd>${money(b.quote_total_paise)}</dd></div><div><dt>Advance percentage</dt><dd>${b.advance_percent}%</dd></div><div class="checkout-due"><dt>Due now</dt><dd>${money(due)}</dd></div><div><dt>Remaining after advance</dt><dd>${money(Number(b.quote_total_paise)-due)}</dd></div></dl>${b.quote_notes?`<p>${escapeHTML(b.quote_notes)}</p>`:''}<label class="check-row"><input id="accept-payment-terms" type="checkbox"> I reviewed the quotation and accept its cancellation terms.</label><button class="button" id="pay-advance" ${config.payments&&b.status==='quotation_ready'?'':'disabled'}>Pay ${money(due)} securely ↗</button><p class="form-status" role="status"></p></section><aside class="checkout-trust"><span>SECURE CHECKOUT</span><h2>Your payment details stay with Razorpay.</h2><ul><li>Order amount generated by the KUBOVISTA server</li><li>Checkout signature verified after payment</li><li>Final status confirmed through a signed webhook</li><li>No card or UPI credentials stored by KUBOVISTA</li></ul>${!config.payments?'<div class="setup-notice"><strong>Payments need configuration</strong><p>Online payments are temporarily unavailable. Please contact your travel expert.</p></div>':''}<a href="#/cancellation">Cancellation & refund policy ↗</a></aside></div>`);
  document.querySelector('#pay-advance').addEventListener('click',async event=>{const terms=document.querySelector('#accept-payment-terms');const status=document.querySelector('.form-status');if(!terms.checked){status.textContent='Please review and accept the quotation terms first.';return;}const payButton=event.currentTarget;payButton.disabled=true;status.textContent='Preparing secure checkout…';try{const order=await request('/api/payments/create-order',{method:'POST',body:JSON.stringify({bookingId:b.id})});await loadRazorpay();const checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,name:'KUBOVISTA',description:`Advance for ${order.booking.destination}`,order_id:order.orderId,prefill:order.customer,theme:{color:'#cde77f'},modal:{ondismiss:()=>{status.textContent='Checkout closed. No payment status was changed.';document.querySelector('#pay-advance')?.removeAttribute('disabled');}},handler:async response=>{status.textContent='Verifying payment…';try{const verified=await request('/api/payments/verify',{method:'POST',body:JSON.stringify(response)});location.hash=verified.captured?`/payment/success?booking=${b.id}`:`/payment/pending?booking=${b.id}`;}catch(error){location.hash=`/payment/failed?booking=${b.id}&reason=${encodeURIComponent(error.message)}`;}}});checkout.on('payment.failed',response=>{location.hash=`/payment/failed?booking=${b.id}&reason=${encodeURIComponent(response.error?.description||'Payment failed')}`;});checkout.open();}catch(error){status.textContent=error.message;document.querySelector('#pay-advance')?.removeAttribute('disabled');toast(error.message);}});
}

function loadRazorpay(){if(window.Razorpay)return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('Secure checkout could not be loaded.'));document.head.append(script);});}

async function paymentResultPage(main, session, state) {
  const params=new URLSearchParams(location.hash.split('?')[1]||'');const booking=params.get('booking'); const {payments}=await request('/api/payments'); const payment=payments.find(p=>p.booking_id===booking); state=payment?.status==='captured'?'success':payment?.status==='authorized'?'pending':'failed'; const failed=state==='failed';const pending=state==='pending';
  shell(main, 'payments', session, failed?'Payment not completed.':pending?'Payment received.<br><em>Confirmation pending.</em>':'Advance received.<br><em>Your trip moves forward.</em>', failed?'No successful charge was confirmed. You can return to the quotation and try again.':pending?'The checkout signature is valid; the final captured status is still syncing securely.':'Your payment was captured and linked to the quotation.', `<section class="payment-result ${failed?'failed':pending?'pending':'success'}"><span>${failed?'×':pending?'…':'✓'}</span><h2>${failed?'Let’s try that again.':pending?'We’re confirming it.':'Payment successful.'}</h2><p>${failed?escapeHTML(params.get('reason')||'The payment provider did not confirm the transaction.'):pending?'Do not pay again. Refresh the payment history shortly; the signed webhook will update the final status.':'A payment record is available in your account. Final booking confirmation follows after the travel team completes supplier checks.'}</p><div><a class="button" href="${booking?`#/booking/${encodeURIComponent(booking)}`:'#/bookings'}">Back to trip ↗</a><a class="button outline" href="#/payments">Payment history</a></div></section>`);
}

async function signOut(toast){try{await request('/api/auth/sign-out',{method:'POST',body:'{}'});sessionCache=null;await syncAccountButton();toast('You have been signed out.');location.hash='/';}catch(error){toast(error.message);}}

export async function createConsultation(plan) {
  const session=await getAccountSession(true);if(!session?.user){location.hash='/login?return=/planner';return {redirected:true};}
  const payload={destination:plan.destination,days:plan.days,travelers:plan.travelers,style:plan.style,date:plan.date,budget:plan.budget,notes:plan.notes||''};
  const {booking}=await request('/api/bookings',{method:'POST',body:JSON.stringify(payload)});location.hash=`/booking/${booking.id}`;return {booking};
}

export const accountRoutes = new Set(['login','signup','forgot-password','reset-password','verify-email','welcome','dashboard','profile','settings','security','bookings','booking','payments','notifications','checkout','payment','admin','saved','support']);

export async function renderAccountRoute(route, id, main, toast) {
  const config=await getConfig();
  if(route==='login')return signInPage(main,config,toast);
  if(route==='signup')return signUpPage(main,config,toast);
  if(route==='forgot-password')return forgotPage(main,config);
  if(route==='reset-password')return resetPage(main,config);
  if(route==='verify-email')return verifyPage(main,config);
  const session=await getAccountSession(true);
  if(!session?.user){authRequired(main);return;}
  if(route==='admin')return adminPage(main,session,toast);
  if(route==='saved'){location.hash='/destinations?saved=true';return;}
  if(route==='support'){shell(main,'support',session,'A little help.<br><em>A clearer next step.</em>','Use your trip or payment reference when contacting your travel expert.',`<section class="empty-account"><h2>Support & policies</h2><p>Review your trip details for the contact and service terms provided in your quotation.</p><a class="button" href="#/grievance">Contact & grievance information ↗</a></section>`);return;}
  if(route==='welcome')return profilePage(main,session,toast,true);
  if(route==='dashboard')return dashboardPage(main,session);
  if(route==='profile')return profilePage(main,session,toast);
  if(route==='settings')return settingsPage(main,session,toast);
  if(route==='security')return securityPage(main,session,toast);
  if(route==='bookings')return bookingsPage(main,session);
  if(route==='booking')return bookingDetailPage(main,session,id);
  if(route==='payments')return paymentsPage(main,session);
  if(route==='notifications')return notificationsPage(main,session,toast);
  if(route==='checkout')return checkoutPage(main,session,id,toast);
  if(route==='payment')return paymentResultPage(main,session,id||'failed');
}

async function adminPage(main,session,toast){
 const {bookings}=await request('/api/admin/quote');
 shell(main,'admin',session,'Review requests.<br><em>Prepare quotations.</em>','Only server-authorized administrators can issue quotations.',`<div class="booking-list">${bookings.map(b=>`<article class="booking-card"><div><h3>${escapeHTML(b.destination_name)}</h3><p>${escapeHTML(b.name)} · ${escapeHTML(b.email)} · ${b.days} days · ${b.travelers} travelers</p><small>${escapeHTML(b.id)}</small></div>${statusPill(b.status)}</article>`).join('')}</div><form id="quote-form" class="account-form quote-card"><h2>Issue a quotation</h2><label>Trip request<select name="bookingId" required>${bookings.filter(b=>['consultation_requested','consultation_scheduled','quotation_ready'].includes(b.status)).map(b=>`<option value="${b.id}">${escapeHTML(b.destination_name)} — ${escapeHTML(b.name)} (${b.id.slice(0,8)})</option>`).join('')}</select></label>${field('Total amount (INR, including taxes)','totalAmount','number','min="1" max="10000000" step="0.01" required')}${field('Advance percentage','advancePercent','number','value="25" min="1" max="100" required')}${field('Valid until','expiresAt','datetime-local','required')}<label>Seller, supplier scope, inclusions, exclusions, taxes and cancellation/refund terms<textarea name="notes" minlength="30" maxlength="1200" required></textarea></label><button class="button" type="submit">Issue quotation</button><p class="form-status" role="status"></p></form>`);
 const form=document.querySelector('#quote-form');form.addEventListener('submit',async event=>{event.preventDefault();const body=Object.fromEntries(new FormData(form));body.expiresAt=new Date(body.expiresAt).toISOString();const button=form.querySelector('button');button.disabled=true;try{await request('/api/admin/quote',{method:'POST',body:JSON.stringify(body)});toast('Quotation issued.');await adminPage(main,session,toast);}catch(error){form.querySelector('.form-status').textContent=error.message;button.disabled=false;}});
}
