# KuboVistas

A complete responsive travel-guide frontend with a dark alpine visual identity, cinematic local photography, pointer-responsive 3D cards, scroll reveals, parallax and accessible motion controls.

## Run locally

Use Node.js 24.x, matching the pinned Vercel runtime and CI. Install the pinned dependencies with `npm ci`. See [account and payment setup](SETUP_AUTH_PAYMENTS.md) for database, email and merchant configuration.

```sh
npm run dev
```

Open http://localhost:3000. To validate and build:

```sh
npm run check
npm run build
```

The production output is `dist/`. Deploy to Vercel for the account and payment APIs. Static hosts support only the public guide. All navigation uses hash routes so nested views work on static hosting and GitHub Pages project paths without server rewrites. No deployment or hosting account is provisioned by this repository.

### Vercel

Import the repository with its root directory set to the repository root. The checked-in `vercel.json` selects the Other framework preset, runs `npm run build`, and serves `dist/`. Its output-directory setting overrides a dashboard value such as `public`; do not rename the generated directory. Node.js is pinned to `24.x` in `package.json` to avoid automatic major-version upgrades. Deploy the commit containing these changes rather than redeploying the earlier failing commit.

## Included

- Cinematic responsive home page with discovery controls.
- Careers, sponsorships, partnerships, verified stay directory, camping/trekking checklists and contact enquiries.
- India destination map, monthly seasonal guidance, expanded experience filters and optional Open-Meteo weather for travel dates.
- 28 destination guides; search, spelling aliases, region and travel-style filters.
- Saved destinations persisted locally with storage-failure handling.
- Three sample journeys with accessible native-dialog itineraries.
- Field notes index and individual editorial articles.
- About / philosophy plus a complete Legal Centre with privacy, terms, cookies and local storage, cancellation and refunds, travel disclaimer, accessibility, grievance redressal, and copyright policies.
- Three-step planner with dates, group size, pace and user-defined budget.
- Editable trip brief, browser-local saving and downloadable text export.
- Mobile navigation, keyboard focus states, reduced-motion support and motion toggle.
- Dedicated mobile dock, full-screen touch navigation, tablet-specific two-column compositions, compact laptop layouts and large-screen scaling.
- Scroll progress, refined route transitions, parallax, perspective cards, animated editorial rail and touch-safe motion fallbacks.
- Self-hosted photography; Razorpay Checkout loads from the provider only when paying.
- Verified email/password authentication, optional Google login, profile, settings and session management.
- Traveler consultations, administrator quotations, Razorpay advances, payment history and notifications.
- Content/asset tests and a GitHub Actions validation workflow.

## Edit the content

`data.js` contains all destination introductions, suggested durations, experiences, journeys and articles. `app.js` owns views, routing and browser state. `styles.css` contains the complete visual system and responsive breakpoints.

## Scope and launch requirements

The public guide works without credentials. Server-backed accounts and quotation payments require the services described in [SETUP_AUTH_PAYMENTS.md](SETUP_AUTH_PAYMENTS.md). No supplier reservations or live availability are automated. Configure real business contacts, supplier agreements and quotation terms before commercial launch.

Do not insert fabricated reviews, live availability, discounts or destination-specific imagery without verification. Frontend local storage is not a secure store for identity documents or payment information.

## Photography

Photos are stored locally for dependable rendering. The copyright in photographs remains with their respective authors; see [ASSETS.md](ASSETS.md) for source pages and license links. Regional inspiration images are explicitly identified rather than attributed to every village.

## Validation

`npm run check` validates JavaScript syntax and tests destination IDs, route references, itinerary lengths, editorial content and JPEG signatures. Browser QA should cover desktop/tablet/mobile layouts, filters, local saving, dialogs, planner export, keyboard access, reduced motion and storage failures.

### Serverless function budget

The application has 10 deployable JavaScript entry points under `api/`. Profile, settings, bookings and notifications share `api/account.js`; their original URLs are preserved by four explicit Vercel rewrites. Their existing authenticated handlers live under `server/account/` so they are bundled dependencies rather than separate serverless functions. Local development uses the same dispatcher. Authentication and payment webhooks retain their separate raw-body entry points.

Do not leave forwarding files in `api/` for those four URLs: each would add another function. The deployment routing test guards the 12-function ceiling. This reduces function count only; other plan limits and commercial-use terms still apply.
