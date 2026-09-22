# Google AdSense setup

This integration is disabled by default. It does not create an AdSense account or guarantee approval or earnings.

## 1. Verify your site

Add the actual public website domain in AdSense (not the GitHub repository URL). In Vercel, set the production build environment variable `ADSENSE_PUBLISHER_ID` to your real `ca-pub-` ID followed by 16 digits. Redeploy. The build inserts Google's account verification meta tag into the HTML head and creates `/ads.txt` with the matching seller record. Choose meta-tag verification in AdSense, verify ownership and request review.

Keep `ADSENSE_ENABLED` unset or `false` during verification. Never use the example IDs from tests. Environment changes require a new build. Keep preview deployments unconfigured.

## 2. Configure privacy and an ad unit

Create a responsive Display ad unit in AdSense and copy its numeric `data-ad-slot` value. Keep **Auto ads OFF**: this hash-routed application cannot reliably use ordinary URL exclusions to separate checkout and account screens. This implementation uses manual placements on home, destinations and the travel guide only; it does not monetise user-generated stories or private pages.

In AdSense Privacy & messaging, configure and publish the appropriate consent messages for your audiences. Use a Google-certified CMP for applicable EEA, UK and Switzerland traffic. If using Google's message, confirm that it displays with the AdSense tag; a third-party CMP may require its own installed tag. Test rejection, acceptance and revisiting privacy choices. The Load advertisement button is a network-loading choice, NOT a certified CMP or a replacement for regional consent requirements. Review the site's privacy/cookie disclosures against your actual configuration.

## 3. Activate after approval and consent validation

Set these production build variables and redeploy:

| Variable | Value |
| --- | --- |
| `ADSENSE_PUBLISHER_ID` | Your real `ca-pub-…` account ID |
| `ADSENSE_SLOT_ID` | Numeric responsive Display ad unit ID |
| `ADSENSE_CONSENT_READY` | `true` only after publishing and validating consent handling |
| `ADSENSE_ENABLED` | `true` |

`ADSENSE_CONSENT_READY` is an operator configuration acknowledgment, not an automated compliance check. No credentials or passwords are needed in frontend code. Publisher and slot IDs are public identifiers.

## Behaviour and validation

- Eligible pages show a labelled, responsive optional advertisement region; a visitor must select Load advertisement before Google's script is requested.
- There is no timer-based refresh. Each eligible route requests at most one placement per document session. Returning to a previously served route does not request another impression.
- Navigation removes the region; a pending script load checks that its original region is still mounted before requesting an ad. Already loaded Google scripts remain in the document until reload.
- An ad blocker, script error or unfilled inventory must not stop travel browsing. No placeholder ad claims earnings or approval.
- Verify the production HTML contains your publisher meta tag and `/ads.txt` is publicly reachable with the correct line.
- Check mobile, tablet and desktop layouts; verify login, planner, checkout and account routes have no ad units. Confirm Auto ads remains disabled in Google's dashboard.
- Validate consent using the CMP tools and relevant regional test settings before enabling production ads. Do not click your own ads or encourage visitors to click them.
- AdSense review and inventory availability determine whether ads appear; code alone cannot ensure delivery.

Run `npm run check` and `npm run build`. To inspect configured build output locally, supply the variables to the build and serve `dist/` using a static server. `npm run dev` serves unconfigured source files and intentionally does not activate ads.

To disable new ad loads, set `ADSENSE_ENABLED=false` and redeploy. Existing open tabs must reload to pick up this change.

Official references:
- https://support.google.com/adsense/answer/7584263
- https://support.google.com/adsense/answer/12171612
- https://support.google.com/adsense/answer/13554116
