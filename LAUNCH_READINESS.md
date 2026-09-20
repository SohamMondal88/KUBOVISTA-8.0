# KuboVistas — launch readiness review

Reviewed 20 September 2026. Baseline: main at f27be19, plus this branch's branding/navigation fixes. Public configuration checked at https://kubovistas.vercel.app. This is a scoped code/configuration audit, not a penetration test, legal sign-off or a guarantee that every defect has been found.

## Decision

**NO-GO for paid-booking or full-service marketing.** The public site currently works as an informational prototype. Auth, database, transactional email, payments, enquiries and generative Kubo AI report disabled. Verified customer contact information is absent. Do not advertise working online reservations, instant refunds, live weather or AI replies until those services pass staging and production smoke checks.

A limited destination-awareness campaign is a separate option only after a monitored contact channel is published, branding is deployed, mobile layouts are checked, and campaign copy accurately describes what is available.

## What this branch changes

- Visible brand becomes **KuboVistas**: header/footer wordmark without the old k-arrow or 8.0 badge, page titles, account copy, Kubo, company/journal labels, payment checkout display name, legal copy, email templates and downloadable briefs.
- Existing repository URLs, Instagram handle, storage keys and package/database identifiers remain intact to avoid broken links and lost saved plans. They are identifiers, not the public brand. Set the production AUTH_EMAIL_FROM display name to KuboVistas as well.
- Header layouts: mobile below 768px, tablet two-row navigation from 768–1199px, laptop/desktop single row from 1200px.
- Mobile navigation scrolls inside the available viewport, accounts for safe areas and restores focus on Escape. Tablet navigation remains visible without a hamburger; dropdown height is bounded.
- Footer: four columns on laptops, two on tablets/small landscape screens, expandable sections below 600px; larger touch targets and wrapping social controls.
- Reduced-motion support retained. Footer expands/collapses appropriately when changing layout width.
- Fixed loss of edits when moving a sample journey into the planner.
- Replaced an internal developer setup-guide link in the unavailable-account screen with customer contact navigation.
- Added a useful no-JavaScript message and official contact link.

## Live configuration evidence

Only public configuration endpoints were read. No secrets, private records, payment requests or enquiry submissions were accessed.

| Endpoint | Observed result | Meaning |
| --- | --- | --- |
| `/api/config` | auth=false, database=false, emailVerification=false, google=false, payments=false | Booking/account conversion cannot operate on the current public deployment |
| `/api/config?service=contact-info` | enquiries=false; email/phone/address absent | Form unavailable and verified direct business contact details missing |
| `/api/config?service=kubo` | ai=false | Only built-in guide mode available; no live generative AI claim |
| `/api/config?service=social-links` | Instagram configured only | Remaining social profiles are not connected |

Configuration flags are not end-to-end service health checks. Even after flags become true, actual flows must be tested.

## Outstanding issues, sorted by severity

Critical means a blocker for accepting customer money or operating the advertised commercial service. It does not mean a critical exploitable vulnerability was demonstrated. High means material customer, payment, privacy or operational risk. Medium means conversion, quality, accessibility or maintenance gaps. Low means polish/optional expansion.

| ID | Level | Finding and evidence | Required fix / acceptance condition |
| --- | --- | --- | --- |
| C01 | Critical | Live database, accounts, email verification and payments are disabled. Verified public configuration above. | Provision PostgreSQL; apply all migrations; configure auth origin/secret, verified email sender and Razorpay; complete real staged signup → quotation → deposit → check-in → balance tests before enabling checkout. |
| C02 | Critical | No public support email, phone or business address; enquiries disabled. `server/services.js`, live contact-info response and legal pages still require verified business/grievance information. | Publish actual operator identity and monitored private support/grievance channels; activate enquiries; approve customer-facing terms with qualified local advice. Never put customer documents or payment disputes in public GitHub issues. |
| H01 | High | A verified authorized payment sets `signature_verified=true`; a later captured verification only updates booking state when `!previous.signature_verified`. `api/payments/verify.js`. A delayed/missing webhook can leave a paid trip pending. | Make the authorized→captured booking transition idempotent independently of signature verification. Test callback-first, webhook-first, duplicate and delayed-delivery permutations against PostgreSQL and Razorpay test mode. |
| H02 | High | `booked_at`/`captured_at` use callback processing `now()` in both capture paths. `api/payments/verify.js`, `api/payments/webhook.js`. A delayed callback can reset the grace period used for cancellation fees. | Define and persist an authoritative payment/capture timestamp supported by the provider, or require manual review if unavailable. Never infer capture time from delivery time. Reconcile existing records and test grace-window boundaries before live use. |
| H03 | High | Cancellation records a deduction/refundable remainder but does not send a refund. `server/trip-actions.js`; partial provider refunds remain `refund_pending`, without a full refund ledger visible to travelers. | Implement or document an operator-owned refund workflow, actual amounts/references/status, reconciliation and customer notification. Test partial, full, failed and duplicate refunds; do not advertise automatic refunds. |
| H04 | High | Any created/authorized/failed order blocks cancellation pending reconciliation. There is no operator reconciliation screen/process in the app. `server/trip-actions.js`. | Add an audited provider reconciliation workflow for abandoned/failed orders, then safely release eligible cancellations. Do not blindly mark failures settled because a capture can arrive late. |
| H05 | High | No configured-database integration tests or live service E2E evidence. Current automated tests mostly cover pure policy/validation/signature behavior. | Test two-account data isolation, admin authorization, email verification/reset, quotation locking/expiry, duplicate payment events, bookings and refunds in staging; record results. |
| H06 | High | Lead capture is unavailable; enquiries save to the DB only when activated and do not notify staff. `company.js`, `server/services.js`. | Enable the form and establish a monitored inbox, responsible team member, response target and email alerts/CRM workflow. Verify a test lead reaches staff and can be answered. |
| H07 | High | Backups, restore drills, uptime/error alerts, incident ownership, rate limiting at the edge and scheduled retention jobs are not established by repository code. Deployment-level settings were not accessible. | Verify and document provider backups/restore, monitoring, WAF/spend controls, recovery owner and deletion schedules. Test a restore. Record deployment settings rather than assuming they exist. |
| H08 | High | Banking, identity, emergency-contact and accessibility-related workflows need an operational privacy/retention process; account records and webhook payloads persist. `server/auth.js`, `api/profile.js`, DB migrations. | Minimize collected fields, define retention, restrict staff access and establish private export/deletion/grievance handling. Commission a compliance review for the actual business; this audit does not certify legal compliance. |
| M01 | Medium | Live Kubo generative AI is disabled. Its guide mode is deterministic, not a full AI conversation. | Apply migration 005; configure OPENAI_API_KEY, OPENAI_MODEL and KUBO_AI_ENABLED with verified auth. Test model compatibility, consent, language support, quota, outages and factual grounding; set provider spend controls. |
| M02 | Medium | Live weather requires separate service activation. No successful live weather response was verified in this audit. `server/weather.js`. | Configure the licensed weather provider, verify returned units/timestamps/dates, failure states and out-of-horizon notices. Never market guaranteed or unlimited-date forecasts. |
| M03 | Medium | `partnerStays=[]`; no verified partnered hotels, homestays or hostels are listed. `partner-data.js`. | Obtain listing permission and add actual properties, exact location, room/meal/accessibility details, original photos and verified contact/booking arrangements. |
| M04 | Medium | Destination details are brief; Samsu and Kolbong require exact-locality confirmation. `data.js`, `destination-meta.js`. | Verify those locations before routing travelers. Add destination-specific arrival options, realistic transfer guidance, permits, local attractions and reviewed seasonal/access information. |
| M05 | Medium | The website reuses two inspiration photos for many destinations. `imageFor()` in app.js, assets. | Add licensed, accurate destination/property galleries with informative alt text and optimized responsive images. Keep inspiration labels until then. |
| M06 | Medium | Hash-based routes share one initial HTML document; route-specific crawler-friendly pages, canonical strategy, sitemap and social-sharing metadata are missing. `index.html`, `app.js`, build scripts. | Before SEO-led marketing, implement prerendered/SSR public routes or equivalent crawlable pages; add page-specific metadata, canonical URLs, XML sitemap, robots policy and genuine structured data. Do not put hash routes into a sitemap as separate indexable pages. |
| M07 | Medium | No first-party campaign analytics, conversion funnel or UTM reporting is implemented. Existing cookie text states no first-party advertising trackers. | Choose appropriate analytics and consent approach; track campaign → destination → planner → consultation → paid booking without collecting chat/payment secrets. Update privacy/cookie notices if tracking is added. |
| M08 | Medium | Settings imply companion visibility and language behavior, but values are stored preferences only; no companion sharing or full-site localization exists. `account.js`, `api/settings.js`. | Label unsupported features as preferences or hide them until built. Implement actual translations/access controls before promising those features. |
| M09 | Medium | User notification rows exist, but trip confirmations and other booking lifecycle emails/SMS/WhatsApp delivery are not implemented. `api/notifications.js`, `server/email.js`. | Define required lifecycle messages, implement reliable delivery/retries and test receipts. Avoid suggesting stored notification preferences already deliver campaigns. |
| M10 | Medium | No invoice download, supplier voucher, customer tax breakdown or clear structured inclusions/exclusions schema; quotation terms are free text. | Add reviewed quotation line items, seller details, applicable taxes, receipt/invoice and confirmation documents suited to the actual business. |
| M11 | Medium | No support-ticket lifecycle or logged resolution history; support page points to policies. `account.js`. | Add private support requests with references, assignment, status and audit history, or integrate a monitored support platform. |
| M12 | Medium | Browser layout/keyboard QA of this branch is not complete; no measured Core Web Vitals or screen-reader results. Static tests do not prove mobile correctness. | Complete the device matrix below and Lighthouse/accessibility testing on an accessible deployed preview; fix overlap, focus, contrast, zoom and keyboard issues before campaigns. |
| M13 | Medium | `api/bookings.js` validates date shape, not calendar validity/future date; malformed dates can become DB errors. Read endpoints often pass arbitrary IDs to UUID columns. | Add shared real-date and UUID validation; return clear 400 responses and test invalid inputs. |
| M14 | Medium | Several async hash-route renderers do not cancel stale requests; fast navigation can allow old requests to replace the current page. `app.js`, account/company/journal render paths. | Add route generation guards or AbortControllers consistently and test slow-network back/forward navigation. |
| M15 | Medium | No explicit application CSP/security-header configuration in `vercel.json`; actual hosting headers have not been comprehensively audited. | Review real response headers; introduce tested CSP, framing, content-type and referrer protections compatible with payment, map and Instagram integrations. Do not deploy an untested restrictive CSP. |
| L01 | Low | Only Instagram has a verified social URL. | Supply official YouTube, WhatsApp, LinkedIn and X URLs or omit inactive networks from campaign entry points. |
| L02 | Low | Careers has no vacancies; sponsorship/partnership pages are enquiry outlines rather than published programs. | Add real roles and partner/sponsor criteria when available. Empty states are appropriate; do not invent roles or affiliations. |
| L03 | Low | Camping kits are checklists, not bookable/rentable stock. Train/bus buttons link externally and do not issue tickets. | Keep these capabilities described accurately; build inventory/ticket partnerships only if required by the business model. |
| L04 | Low | No validated testimonials, traveler ratings, referral system, newsletter delivery or comparison tools. | Add only genuine consented reviews; prioritize features based on actual conversion/customer needs rather than fabricated social proof. |
| L05 | Low | Large single-line JS/CSS files and layered legacy responsive styles complicate maintenance. | Format/split modules and retire superseded shell styles once the new layouts are device-verified. Add focused E2E coverage for the navigation and booking journeys. |

## Fixed in this branch

| Original priority | Issue | Change |
| --- | --- | --- |
| Medium | Inconsistent/oversized old wordmark and 8.0 branding | Plain KuboVistas wordmark and visible copy updated throughout |
| Medium | Tablet navigation used the same full-screen menu as mobile | Separate two-row tablet layout; mobile-only hamburger below 768px |
| Medium | Navbar/menu heights and breakpoints could disagree on scroll or resize | One defined header height per layout; menu offset and resize logic aligned |
| Medium | Dense small-screen footer | Expandable phone sections; wider touch targets and safe wrapping |
| Medium | Edited sample-journey days discarded on planner navigation | Copies destination, duration and edited days into planner state before navigating |
| Low | Unavailable account page sent customers to developer instructions | Customer contact link and plain unavailable-service wording |
| Low | Blank main content when JavaScript is off | Explicit fallback description and official Instagram contact link |

## Verification performed

- `npm run check`: all 32 tests passed after the shell/brand changes; syntax checks and final build rerun after the journey edit fix.
- `npm run build`: generated `dist/` successfully.
- `git diff --check`: passed.
- HTML duplicate-ID check, referenced local asset existence and static relative module imports: passed.
- `npm audit --omit=dev --json`: zero known dependency vulnerabilities reported for the lockfile on the review date. This does not establish that the application has no security flaws.
- Public read-only configuration endpoints: results recorded above.
- No production migration, credential changes, customer data write, real payment or refund was attempted.
- Browser inspection of the public site did not complete in this environment; prior preview deployments required Vercel authentication. Responsive CSS is implemented, but rendered device results and production transaction behavior are not certified.

## Required launch sign-off matrix

| Area | Cases to verify | Current status |
| --- | --- | --- |
| Phone | 320, 360, 390, 430px; portrait/landscape; menu/Discover scroll; footer groups; Kubo/input keyboard; dock overlap | Pending rendered QA |
| Tablet | 768, 820, 1024px; two-row navigation; Discover dropdown; rotation; footer two columns | Pending rendered QA |
| Laptop/desktop | 1280, 1366, 1440, 1920px; account actions; overflow and dropdown bounds | Pending rendered QA |
| Accessibility | Keyboard-only menu/dialog use; focus restoration; screen reader labels; 200% zoom; reduced motion; contrast/touch targets | Pending device/a11y checks |
| Account | Signup, real verification email, login/logout, reset, expired links, Google if enabled, session revocation | Blocked by configuration |
| Conversion | Valid/invalid enquiry, consultation, operator response, quote terms and expiry | Blocked by configuration |
| Payments | Authorized/captured transition, webhook ordering/retries, exact 20/80 totals, checked-in-only balance, partial/full refund | Blocked by configuration and H01–H04 |
| Data safety | Two-user isolation, admin denial, consent, account closure, backups/restore, retention | Pending staging/operations |
| Content | All listed places and partners verified, contacts and terms approved, photos licensed, social links correct | Incomplete |
| Marketing | Approved capability claims, page-specific SEO/social previews, campaign attribution, measured mobile performance | Incomplete |

## Suggested execution order

1. Merge and deploy the branding/navigation update; run rendered device checks.
2. Supply real business/contact/legal details and configure a monitored enquiry path.
3. Resolve H01–H04 before accepting money; activate and test database/auth/email/payment integrations in staging.
4. Add verified destination and property content; set service expectations accurately.
5. Complete security/operations, responsive/a11y and conversion checks; measure performance.
6. Activate optional Kubo AI/weather only after successful provider tests. Finish campaign landing pages/attribution before paid acquisition.
