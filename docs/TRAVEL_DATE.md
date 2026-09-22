# Travel Date

Travel Date is an adult travel-companion finder, not romantic matchmaking or a confirmed booking service. The public landing page explains the service. Real trip listings require sign-in and verified email; no fabricated travellers, safety scores, profile photos or matches are seeded.

## Activation

1. Configure the existing PostgreSQL, Better Auth and transactional email services.
2. Run `npm run db:migrate` with the production database connection from a trusted environment. This adds migration 006; it does not alter existing booking/payment tables.
3. Assign real moderators through the existing verified-admin role or `ADMIN_EMAILS`. Publish functioning business contact channels for coordination and support.
4. Set `TRAVEL_DATE_ENABLED=true` on the backend and redeploy only when someone can review posts and reports. With the flag off or core services missing, writes return 503 and no matching data is available.
5. Visit `#/travel-date` using separate verified organiser, traveller and administrator accounts. Test moderation, join, accept/decline, withdrawal, close, report, block and account deletion in staging before launch.

## Workflow

- Verified member attests 18+ and submits destination, dates, style, per-person estimate, companion places, display name and description.
- Posts start pending, including administrator submissions. Admins see the Moderation tab and publish or reject them. The same restricted tab lists accepted introductions and account emails for staff coordination; contact each member separately and obtain agreement before sharing details.
- Browse lists up to 100 upcoming approved plans, excluding one's own plans and blocked relationships. Filters match destination, style, overlapping dates and maximum budget. These are transparent filters, not an AI compatibility score.
- Join requests include an adult attestation and a short introduction. Owners accept or decline from My plans & requests. One request per traveller per trip; withdrawal is final for that request in this release.
- Acceptance locks the trip row and checks capacity. It is not a paid reservation. Accepted travellers ask the team to coordinate with a trip reference; this release has no direct messaging or automatic disclosure of contact details. The operator must obtain both travellers' agreement before sharing contact details.
- Closing removes discovery. Past departure dates also stop discovery and new acceptance. Existing request history remains visible with plan status; acceptance does not reopen closed or removed plans.
- Blocks hide plans/requests both ways and withdraw active requests between the two accounts. They persist until account deletion or support-assisted handling. Public posts can be reported; moderators may remove a published trip and mark a report reviewed. Reports are not emergency support.

## Controls and limits

Authentication, origin checks, verified-email gates, owner checks and admin checks run on the server. Publication is never taken from member input. Public output excludes account IDs, emails and phone numbers. Only plain escaped user text is rendered. The text validator rejects common contact/link patterns; it is not a comprehensive detection system, so human review remains necessary. Do not call members identity-verified: age is self-attested and there is no KYC/background check.

Limits per member: 3 posts, 20 join requests and 10 unique reports in a rolling day, serialized using the member row. Unique constraints prevent duplicate join requests/reports. There is no public member directory or guest access to detailed travel plans.

School and under-18 trips go through an authorised organiser contacting the agency, outside adult stranger matching. Couples, solo travellers, friends, adult family organisers and adult students can participate. Dates and budgets are plans, not guaranteed availability or agency quotes.

## Data lifecycle

Records are linked to the existing user table. Account deletion cascades the member's trips, requests, blocks and reports; deleting a trip also removes related requests/reports. There is no independent archival retention job. Closed plans remain in account history while the account exists. Document any future retention changes in the privacy notice.

## Verification and remaining production work

`npm run check` covers syntax, validation, enabled/disabled behaviour, permission gates, query restrictions and full-capacity rejection with injected dependencies. These do not replace a real PostgreSQL integration test. Before enabling, run the two-user/admin workflow against the migrated database and test concurrent acceptance/blocking, provider configuration and contact coordination. Browser validation was attempted but blocked because the Chromium download was unavailable/corrupted in the development environment. Mobile/tablet/desktop visual checks and the full real-account workflow remain required before activation.

This feature adds no paid API, subscription or tracking dependency. AdSense is not enabled on Travel Date. KuboVistas still uses hash routing, so full public-page SEO needs a separate routing/rendering project.
