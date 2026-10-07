# Brand, chat, account and checkout follow-up

## Implemented
- Header/footer show only the existing logo asset, with accessible link names and uncropped scaling.
- Kubo has a single stylesheet, a compact message-icon launcher, contrast-safe bubbles,
  44px controls, mobile safe areas, keyboard close/focus return and unchanged provider consent.
- Password fields support visibility toggling. Signup/reset fields show length-based
  guidance, not a claim of cryptographic strength. Login policy is unchanged.
- Google credential failures no longer display an email/password migration diagnosis.
  Starting an email or Google attempt clears the other method's stale error.
- Homepage background photo is removed. Upload `assets/videos/home-hero.mp4`, then build.
  No missing video is requested before upload. Reduced-motion/data-saving users can play manually.
- Confirmation/thank-you pages can print/save booking details and captured-payment
  acknowledgements. These are explicitly not tax invoices or supplier confirmations.
- Local preview now serves nested asset directories and MP4 MIME types.

## Production blockers — not fixed by CSS or local tests
The reported request `bom1::lltb7-1791405453285-d2270fbb112f` could not be investigated:
Vercel runtime-log access returned 403. Firebase user presence alone is not proof
that token verification and PostgreSQL identity mapping succeed.
The earlier production migration run failed before connecting because GitHub's
Production environment lacked `DATABASE_URL`. Verify the secret is now configured,
then use the existing protected workflow after backup confirmation. Do not run
migrations automatically in deployment builds. Inspect readiness and sanitized
runtime logs before claiming the production login incident is resolved.

## Payment journey
Trip request -> operator-reviewed quotation -> traveler acceptance -> checkout
20% deposit -> Razorpay modal -> server signature/provider capture verification
and webhook reconciliation -> thank-you/account details -> supplier confirmation
-> operator-verified check-in -> remaining 80% -> issued final invoice.
The team must actually assign a guide and arrange the call. The interface does
not claim that an automated phone call or confirmed reservation already exists.
Live capture, cancellation, replay, delayed webhook and refund tests remain required.

## AdSense
The supplied rejection notice is generic, not proof of a specific violation.
Obtain the exact account/email rejection reason. Do not declare dashboard/CMP
verification true merely to enable ads, and do not create another publisher account.
Review every publicly linked page for original, useful content, accurate attribution,
working navigation and honest inventory/disclosures. Restrict ads to eligible
editorial pages; keep accounts, checkout and low-content states ad-free. Approval
is Google's decision and cannot be guaranteed by these changes.
Reference: https://support.google.com/adsense/answer/81904

## Security structure
This deployment uses Vercel functions and `vercel.json`, not Apache/nginx.
Adding `.htaccess` or an unused `nginx.conf` does not secure Vercel. Secrets stay
in environment settings; `.env*` is ignored except the non-secret example.
The build copies an explicit public-file allowlist, not the server source directory.
`robots.txt` controls crawlers, not authorization; account/admin endpoints must
continue enforcing server-side authentication, ownership and roles.

## Remaining inputs
Upload the licensed hero MP4. The attachment referenced in chat was unavailable;
the existing repository logo was retained. Restore Vercel log access and provide
the specific AdSense rejection reason (without passwords or secret values).

## Verification in this workspace
- `npm run check`: 117 tests passed.
- `npm run build`, `npm run lint`, `npm run format:check`: passed.
- `npm run security:secrets`: no recognized secrets found in tracked files.
- Added responsive logo/chat tests for 360–1920px and password visibility/guidance tests.
  Browser execution was blocked by missing Playwright Chromium; its download
  returned invalid/truncated archives. No mobile/tablet/desktop visual pass is claimed.
- Production login, Razorpay capture/refund, Firestore emulator and real uploaded
  hero-video playback were not verified. A release review is still required.
