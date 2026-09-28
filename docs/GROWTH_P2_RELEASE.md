# Growth P2 release and activation

This branch builds on the P0 and P1 branches. Merge and migrate those in order. Apply migration 010 after a database backup and 009. All new public records start empty; no traveler rating, supplier approval, paid membership, sponsored deal or affiliate approval is invented.

## Public discovery

- Region hubs at `/regions/:id` group the existing destination guides and planning concepts. `/search` searches static guides plus published English editorial records when PostgreSQL is available. Search is `noindex`; published CMS detail pages use a client-side route and are not listed in the static sitemap. Add server-rendered metadata or a static publishing export before using CMS pages for search acquisition.
- CMS at `/account/growth` saves English, Hindi or Bengali text per shared slug. Human editors must review each translation. Public `/stories/:slug?lang=...` serves only published language versions. Paid placements display the sponsor name and a clear sponsorship label. Do not publish claims, images, permits, inventory, terms or translations without verification and rights clearance.
- `/reviews` displays only moderated reviews tied to a checked-in or completed booking. Public display says “Verified traveler” rather than exposing the account name. Authors explicitly consent, and only one review per booking is accepted. The admin reviews the queue in `/account/growth`.
- Affiliate URLs must pass host validation and need an actual programme account and recorded approval reference. Admins save and explicitly activate them in the growth desk; `/resources` displays active links with commission disclosure and `rel=sponsored`. Check provider-specific disclosure and branding requirements. Old build-time placements remain separate and use the same validator.

## Accounts and suppliers

- `/account/membership-interest` records interest in proposed Plus/Circle plans. It creates no entitlement, subscription or payment. Commercial membership terms, capacity, tax, renewals and billing must be approved separately before sale.
- An admin grants a verified user access to an approved supplier record in `/account/growth`. `/account/supplier-portal` shows only that supplier's active assigned bookings, destination, departure, group size and staff-entered confirmation reference. The supplier accepts or declines once; declined/pending assignments cannot support new vouchers. Revoke access when staff or supplier contacts change. Run the hand-off with actual supplier accounts and mobile browsers before launch.

## AI

- Existing OpenAI Kubo answers now use selected public source facts and expose links to those facts. Weather numbers still require the weather service. Responses are generated text, not guarantees or live inventory.
- Optional Firebase AI Logic uses `firebase/ai` with a public model name, verified Firebase login, explicit user consent and public source snippets. Set `FIREBASE_APP_CHECK_SITE_KEY`, enable and enforce App Check specifically for Firebase AI Logic in Firebase Console, configure its per-user quota and API key restrictions, then set `FIREBASE_AI_APP_CHECK_VERIFIED=true`, `FIREBASE_AI_MODEL` and `FIREBASE_AI_ENABLED=true` at build time. The flag is an operator attestation; the build cannot inspect the Firebase Console. Leave it off until configured and monitor billing, abuse and answer quality. The client SDK sends the chosen question and selected public context to Google's service. Keep private account facts outside its prompt.

## Manual acceptance checks

Use a traveler with a completed booking, another traveler, a staff/admin account and two supplier accounts. Check review ownership, moderation, duplicate review rejection, draft/published translation visibility, sponsored labeling, affiliate host rejection, supplier assignment isolation/accept/decline/revocation, voucher preconditions and membership non-billing. Test English/Hindi/Bengali text with native speakers. Preview directly opened `/stories/:slug`, region pages, search and mobile navigation on Vercel. Record actual affiliate approvals, sponsorship contracts and provider disclosures. Do not activate Firebase AI Logic until App Check and quota monitoring are verified.
