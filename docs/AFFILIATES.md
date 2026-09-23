# Blog affiliate setup and earning plan

The integration adds contextual recommendation cards to the Journal index, field-note articles and published stories. There are no live affiliate offers until approved account links are configured. No extra serverless function or paid integration is added.

## Get your own tracking links

1. Apply with the actual public KuboVistas domain to the relevant programme:
   - Amazon India Associates: https://affiliate-program.amazon.in/
   - Booking.com: https://www.booking.com/affiliate-program/v2/index.html
   - Viator: https://partnerresources.viator.com/
2. Complete the programme's approval, identity/tax/payout and website requirements as applicable. Do not claim approval before it is received.
3. Generate deep links using that programme's dashboard. An ordinary provider URL is not automatically commission-earning. Never invent a tracking ID or copy another publisher's ID.
4. Review a relevant product/stay/experience and assign the link to a specific article. Do not claim personal testing unless it happened. Use provider dashboards to measure approved sales, commissions, cancellations and payouts.

## Configure offers

Edit `affiliate-data.js` or set `AFFILIATE_OFFERS_JSON` in Vercel's production build environment to a JSON array with the same object format. Redeploy after changes. Environment configuration affects the production build; local source serving reads affiliate-data.js.

Object fields:
- `id`: unique lowercase slug.
- `provider`: `amazon`, `booking` or `viator`.
- `category`: `gear`, `stays` or `experiences`.
- `title`: 4–90 characters; describe the actual destination product.
- `description`: 15–300 characters; explain relevance without invented prices/ratings.
- `url`: complete approved HTTPS tracking link from your own account.
- `placements`: explicit list, e.g. `journal`, `guide:mountain-packing`, `guide:slow-travel` or `story:ACTUAL-PUBLISHED-STORY-ID`.
- `approved`: true only after the account/link and placement have been reviewed. Unapproved objects are not published.

Provider host allowlists currently support amazon.in/www.amazon.in/amzn.to, booking.com/www.booking.com and viator.com/www.viator.com. If your approved network generates a different tracking domain, have it verified and explicitly added to the appropriate host list. Do not substitute an untracked URL to make validation pass. Domain validation cannot verify commission eligibility, tracking ownership, redirect destination or programme approval; manually test each dashboard-issued link.

At most three configured offers appear on each placement. Unrelated offers are not automatically inserted in every story. With no offers configured, only the site's trip-planning enquiry section appears.

## Disclosures and content

The disclosure appears directly before the cards and identifies them as KuboVistas placements, separate from article authors. Amazon wording appears when an Amazon card is present. Outbound links use rel="sponsored noopener noreferrer" and open in a new tab. No affiliate pixels or scripts are loaded and no local click logging is implemented. The provider's attribution/cookie policies apply after the click. Review your programme's complete placement and disclosure requirements before activating.

Do not scrape provider photos, reviews or current prices. Use permitted assets if added later; this initial implementation uses text-only cards. Do not cloak links, incentivise clicks or promise guaranteed commission. Never represent sponsored recommendations as independent traveller reviews.

## Content-to-income plan

- Mountain packing article → a few relevant equipment affiliate links.
- Destination stay guide → a verified direct partner or relevant accommodation affiliate link.
- Local experiences article → actually available activities from an approved programme.
- Every selected article → personalised planning quotation through the existing Contact flow.
- Repeat travellers → membership interest page, accurately marked coming soon.

Prioritise direct planning fees and verified stay partnerships while organic traffic grows. Add labelled sponsorships when you can show real audience/enquiry numbers. AdSense can supplement revenue but is not a substitute for useful content or a working enquiry pipeline. Use meaningful destination/article URLs and server-rendered content in a separate SEO project; hash routing remains a limitation.

Measure enquiries, quote acceptance, completed bookings, approved affiliate commissions and contribution after delivery costs. No revenue is guaranteed. Existing Contact backend must be configured to save enquiries; otherwise it retains its contact-channel fallback.
