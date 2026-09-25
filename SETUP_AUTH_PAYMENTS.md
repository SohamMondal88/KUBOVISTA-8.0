# Account and payment deployment

The code supports Firebase Authentication, PostgreSQL accounts and Razorpay quotation advances. It does not provision merchant accounts, supplier reservations or credentials. Use test mode before accepting money.

## Local setup

1. Install Node 24 and run `npm ci`.
2. Copy `.env.example` to `.env`. Keep this file private; never commit credentials.
3. Create a PostgreSQL database and set `DATABASE_URL`. Remote connections require a valid TLS certificate.
4. Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to configure Firebase Authentication, Admin credentials and `APP_URL`.
5. Run migration 007 and map legacy users before activating `FIREBASE_AUTH_ENABLED`.
6. Firebase sends auth emails; Resend is not needed for verification or password reset. Run `npm run dev` after setup.

The migration creates authentication, profiles, preferences, consultations, quotations, payments and notification tables. Run it against a new database, or review existing table compatibility first. Back up production before schema changes. Existing tables are not automatically upgraded.

## Vercel

Keep the repository root as the project root. The existing `vercel.json` builds to `dist`; the root `api/` directory supplies Node serverless functions. Static-only hosting cannot provide accounts or payments. Set the environment variables securely in Vercel for the intended environment, run the database migration against that environment, then redeploy. Do not expose secrets with a public frontend prefix. Use separate production and preview databases and payment credentials.

## Optional Google login

Enable Google in Firebase Authentication, add the exact site hostname to Authorized domains, and set `FIREBASE_GOOGLE_ENABLED=true`. See FIREBASE_SETUP.md.

## Razorpay

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` from your own merchant account. Configure a webhook at `https://YOUR_DOMAIN/api/payments/webhook` for `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`. Use the same webhook secret on both sides. Enable automatic capture in the merchant dashboard if appropriate for your business. Authorized payments are shown as pending until captured.

Checkout supports payment methods enabled for your Razorpay merchant account, including eligible cards, UPI, netbanking and wallets. This is not an integration with every payment gateway. Refunds are initiated by the operator in Razorpay; the website receives signed status updates. Partial refunds are shown as requiring review rather than claiming a full refund. It does not store card numbers or UPI credentials.

## Quotation workflow

Set `ADMIN_EMAILS` to verified operator email addresses. Sign in and open `#/admin` (also linked from an administrator's dashboard). Travelers submit a consultation from the planner. Issue a quotation with the total inclusive of taxes, fixed 20% deposit, scheduled check-in, expiry, seller identity, service scope and cancellation terms. Amounts come from this server record, never a browser-entered payment amount. Quotations lock once a payment order exists. A captured advance is not automatic supplier confirmation.

Only the quotation owner can open checkout or view their payment records. Checkout HMAC signatures and provider amount/currency/status are verified. Signed webhooks are deduplicated and cannot downgrade captured payments to failed. Transaction-bearing accounts require support-assisted closure; database constraints preserve payment records.

## Pages

`#/login`, `#/signup`, `#/verify-email`, `#/forgot-password`, `#/reset-password`, `#/welcome`, `#/dashboard`, `#/profile`, `#/settings`, `#/security`, `#/bookings`, `#/booking/ID`, `#/checkout/ID`, `#/payments`, `#/payment/STATE`, `#/notifications`, `#/saved`, `#/support`, `#/admin`.

Saved destinations and draft briefs remain device-local. Settings record preferences; this release does not send marketing campaigns, translate pages, share profiles with companions or operate a support-ticket system. Security includes password changes, session revocation, sign-out and eligible account deletion.

## Required release checks

Run `npm run check` and `npm run build`. In an isolated configured environment, verify email signup, verification delivery, reset expiry, Google callback, two-user record isolation, quotation expiry, test checkout capture/failure, duplicate webhooks, partial/full refunds and session revocation. Confirm the merchant and public business/contact/legal details before live use. No live payment or production database verification is performed by the automated repository tests.

Operational follow-up: configure monitoring, database backups, retention/deletion jobs for expired sessions and webhook records, and edge rate limits for consultation creation. Reconcile provider orders when a network interruption occurs between order creation and database commit. Do not manually change financial records without reconciliation.

## Journal and Instagram

Run `npm run db:migrate` after updating to create `journal_posts`. The Journal (`#/journal`) combines existing company field notes with published company and traveler stories. Signed-in travelers submit at `#/write`; `#/my-stories` shows their review status. Server-authorized administrators publish company blogs and approve or decline traveler submissions at `#/journal-review`. Each author is limited to ten submissions per day. Public stories retain an author display name after account deletion; handle removal requests through your published support process.

The Instagram section links to and offers an optional profile preview for `@kubo_vista.official`. Administrators can choose “Company Instagram feature” in the editor to add individual public `/p/` photo/carousel or `/reel/` URLs. Confirm every link belongs to the company and embeds are enabled on Instagram before publishing. No post IDs were guessed or media scraped. Embeds are third-party connections loaded only on a visitor's click; hiding a preview removes its iframe but cannot clear Instagram's cookies. There is no automatic API feed sync or media upload service in this release.

Verify a traveler cannot publish directly or read another user's pending submissions; verify admin approval makes a story public. Test the company profile and featured posts with Instagram embeds enabled. Empty and unavailable states remain usable without credentials.

## Company pages, enquiries, map and weather

New public routes: `#/careers`, `#/sponsors`, `#/partnerships`, `#/stays`, `#/camping`, `#/contact`. The existing About page and global navigation/footer are expanded.

**Verified content:** populate `partner-data.js` with real, confirmed partner stays and actual vacancies. `verified: true` is required for a stay listing. Empty states are intentional until real details are supplied. Camping kits are checklists and enquiry options, not stock or rental commitments. No fabricated properties, jobs, ratings or prices are included.

**Enquiries:** run `npm run db:migrate` to add `003_enquiries.sql`. Configure verified `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CONTACT_PHONE`, `PUBLIC_BUSINESS_ADDRESS` and `APP_URL`. Set `ENQUIRIES_ENABLED=true` only when the team is ready to monitor `#/enquiry-inbox`; verified administrators in the existing allowlist can read and mark enquiries reviewed. Forms save to PostgreSQL and return a reference; no email delivery is claimed or attempted. There is an origin check, honeypot and per-email daily limit. Add provider/WAF rate limiting before public activation because attackers can rotate email addresses. Define a retention policy and remove enquiries when no longer required. Private contact details are returned only to administrators.

**Weather:** set `OPEN_METEO_API_KEY` to a commercial Open-Meteo key in Vercel, then redeploy. Never expose the key in frontend configuration. `WEATHER_DEMO=true` enables the free endpoint for non-commercial evaluation only. Otherwise missing credentials produce an explicit unavailable state. Current values are model estimates, not readings from a local weather station. Up to 16 forecast days are requested and a selected date is shown only if the provider returns it. Later/past dates have no invented forecast. Retrieval timestamps, model time, units and Open-Meteo attribution are displayed. Results are cached per destination for 15 minutes per server instance, with a 10-second upstream timeout. Forecasts are not represented as guaranteed or the most accurate available. Date selection is available in destination guides, planner summaries and booking details. Regions use named reference towns; high passes may have completely different weather.

**Destination map:** Leaflet 1.9.4 is self-hosted with its BSD licence. OpenStreetMap tiles are loaded normally with attribution, without bulk downloading or offline caching. For sustained commercial traffic, arrange an appropriate tile provider and review its terms. The tile provider receives browser connection data. The map centers on India and creates pins from the destination collection, rather than a fixed pin count. Add coordinates/tags to `destination-meta.js` for each new ID (or supply a `location` object and `tags` on a destination object). Missing coordinates are listed but not falsely pinned. Current pins are approximate regional/locality centers, not navigational directions or accommodation locations. Samsu and Kolbong remain unconfirmed and use clearly labeled regional reference pins; weather is disabled for those two.

**Season colors:** monthly editorial templates distinguish typical hills, coast, plains and highland travel. Green means generally favorable, yellow mixed/review locally, red higher seasonal caution. These are provisional planning heuristics, not observed conditions, closure notices, safety classifications or a scientific suitability score. Verify every coordinate and seasonal template with local operators before using them for operational travel advice. September intentionally remains mixed for this collection rather than arbitrarily coloring destinations green. Experiences such as waterfalls may require an excursion; a tag does not imply safe access or that an entire region is a waterfall. Crowded/famous are editorial tags, not live crowd measurements.

Sources for implementation constraints: [Open-Meteo forecast documentation](https://open-meteo.com/en/docs), [commercial licence and API pricing](https://open-meteo.com/en/pricing), [Leaflet API](https://leafletjs.com/reference.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/). Consult [IMD](https://mausam.imd.gov.in/) for official weather advisories. Technical source documentation is not evidence that individual seasonal ratings have been independently validated.

The auxiliary services use `api/config?service=weather|contact-info|enquiries`, retaining the existing serverless-function count rather than adding separate functions for every page.

## Deposit, balance and cancellation rollout

Run `npm run db:migrate` before deploying the updated API; migration `004_deposit_lifecycle.sql` preserves existing quotations as legacy policy version 1. New admin quotations use policy version 2: 20% of the inclusive total at booking, the remainder after recorded check-in. The deposit is credited toward the price, not an additional fee. Configure Razorpay and signed webhooks using the steps above.

Administrators must enter the scheduled check-in, quote expiry no later than check-in, and all cancellation rates explicitly. No commercial deduction rates are supplied by this release. Grace hours (0–168) run from deposit capture, only when more than 24 hours remain before check-in. Outside grace, tiers are >7 days, >24 hours through 7 days, and <=24 hours. Percentages must be nondecreasing and apply only to the captured deposit. Obtain business approval for the actual rates before issuing quotes. Legacy quotations require support handling.

After supplier confirmation, use Confirm booking in the admin page. At arrival, verify actual check-in and use Record check-in; the server blocks this before the scheduled time. Only then can the traveler pay the 80% balance. Confirmation and thank-you pages load owned server records and distinguish payment receipt from supplier confirmation. Editable planner days are stored with the consultation.

Routes: `#/checkout/ID`, `#/checkout/ID?purpose=balance`, `#/confirmation/ID`, `#/thank-you/ID`, `#/cancellation-request/ID`. Cancellation records a timestamped calculation and stops further checkout. It does **not** automatically transfer a refund. Operators must reconcile and issue the refundable remainder in Razorpay; the website must not be represented as automatic refund fulfillment. Unresolved orders and refund states require support reconciliation to avoid cancellation racing a delayed capture. Test deposit capture, operator confirmation, arrival, balance capture, cancellation cutoffs, duplicate requests and signed webhook delivery in a configured staging environment before release.

IRCTC and redBus cards open official external booking websites. They do not issue tickets or synchronize reservations; transport payment and policies are independent.

Public social links: set `PUBLIC_INSTAGRAM_URL`, `PUBLIC_YOUTUBE_URL`, `PUBLIC_WHATSAPP_URL`, `PUBLIC_LINKEDIN_URL`, and `PUBLIC_TWITTER_URL`. Only the supplied Instagram account is preconfigured. Other networks show Coming soon until verified URLs are set; HTTPS provider hosts are validated server-side. Redeploy after setting environment variables.

## Kubo travel assistant and navigation

Kubo opens from the navigation, footer or floating button. Built-in guide mode works without credentials, using the same 28 destination records, sample journeys and field notes as the website. This is explicitly labeled, not presented as generative AI. Chats stay only in page memory, survive hash-route navigation, and disappear on refresh or New chat. Users can download their notes.

For generative AI: run migration `005_kubo_usage.sql` through `npm run db:migrate`, configure existing auth/email verification, then set server-only `OPENAI_API_KEY`, an appropriate text-model ID in `OPENAI_MODEL`, and `KUBO_AI_ENABLED=true`. Use a model supporting the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text) and `max_output_tokens`; no model or billing account is assumed. Redeploy and test using a verified account. AI is opt-in per page session, with a clear provider disclosure. Missing configuration leaves the free built-in guide working.

The service is dispatched through `/api/config?service=kubo` to preserve the existing Vercel function count. It uses same-origin verified authentication, a PostgreSQL atomic quota (30 attempted requests per UTC day per account, 5-second cooldown), 12-message/12,000-character server limits, a 25-second provider timeout, 1,400 maximum output tokens and `store:false`. Failed provider attempts count toward the quota. Apply deployment-wide WAF/rate limits and provider project spend controls before public activation; account quotas alone do not provide a global spending cap. Never log message bodies or keys. Delete `kubo_usage` rows older than 30 days through your scheduled maintenance job (not automatically scheduled by this change).

Only public destination facts and published blog summaries are supplied. Requested weather uses the existing configured weather service, including unavailable and out-of-horizon states. No private booking/payment records, arbitrary browsing, account actions or automatic transactions are exposed to the model. Responses render as text, with application-owned internal links; HTML returned by the model is not executed. Kubo cannot guarantee factual accuracy: verify quotation, access, weather and safety-sensitive statements before travel.

Validate in staging: enabled AI through a verified account; disabled AI; unsigned/cross-origin requests; rate limits; provider outage; stop/retry/new-chat; destination follow-ups; live weather with date; no invented prices; English/Hindi/Bengali requests; keyboard navigation and mobile chat scrolling. Automated tests mock the provider and do not spend API credits.
