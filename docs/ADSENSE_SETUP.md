# Google AdSense setup

The publisher bootstrap is included in the main site's HTML head and the AMP Auto ads tag is included in `amp.html`. Regular app pages use manual responsive ad units because this is a hash-routed single-page app. The integration does not create an AdSense account or guarantee approval or earnings.

## Verify the site

Add the actual public website domain in AdSense (not the GitHub repository URL). The current publisher ID is `ca-pub-3851312120061760`. The production build inserts the publisher verification meta tag and creates `/ads.txt` with the matching seller record. Verify ownership in AdSense and request review.

Vercel serves the app; Hostinger manages DNS for the custom domain. Keep those DNS records pointed to Vercel. The AMP canonical URL in `amp.html` must match the chosen production domain if it changes.

## Configure an ad unit and consent

Create a responsive Display ad unit in AdSense and copy its numeric slot ID. In Vercel, set `ADSENSE_SLOT_ID` for the Production environment. Keep `ADSENSE_ENABLED=false` while configuring Privacy & messaging and validating consent for the audiences you serve. The optional page-level Load advertisement control is not a certified CMP and does not replace regional consent requirements. Use a Google-certified CMP for applicable EEA, UK and Switzerland traffic.

## Activate placements

After the site is approved and consent has been configured and checked, set these Production environment variables in Vercel and redeploy:

| Variable | Value |
| --- | --- |
| `ADSENSE_PUBLISHER_ID` | `ca-pub-3851312120061760` |
| `ADSENSE_SLOT_ID` | Numeric responsive Display ad unit ID from AdSense |
| `ADSENSE_CONSENT_READY` | `true` after consent setup is validated |
| `ADSENSE_ENABLED` | `true` |

The build places a manual ad region on eligible public content routes, including the home page, destination directory, journeys, guides, company information and legal information. Individual destination pages (`#/destination/<slug>`) are excluded. Account, checkout, planner, matching, user-submitted story, admin and unknown routes are also excluded. AMP Auto ads runs only on the separate AMP page.

These route exclusions are enforced by the app code; do not turn on site-wide Auto ads in AdSense for the non-AMP app. The supplied publisher ID is not an ad-unit slot ID, so regular-page ads remain inactive until a valid numeric slot is configured.

## Behaviour and checks

- A visitor explicitly selects **Load advertisement** before the app requests the manual ad unit.
- A route gets at most one placement request per document session. Returning to a previously served route does not request another impression.
- An ad blocker, script error or unfilled inventory must not stop travel browsing.
- Check the production HTML, `/ads.txt`, AMP validation and mobile/tablet/desktop layouts after deployment.
- Confirm destination details and protected routes never show a placement. Do not click your own ads or encourage visitors to click them.
- Google's approval, consent requirements and available inventory determine whether an ad appears; code alone cannot ensure delivery.

Run `npm run check` and `npm run build`. To disable new regular-app ad loads, set `ADSENSE_ENABLED=false` in Vercel and redeploy. Existing open tabs must reload to pick up the change.
