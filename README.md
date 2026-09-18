# KUBOVISTA 8.0

A complete responsive travel-guide frontend with a dark alpine visual identity, cinematic local photography, pointer-responsive 3D cards, scroll reveals, parallax and accessible motion controls.

## Run locally

Requires Node.js 20 or newer. There are **no runtime dependencies** and no install step.

```sh
npm run dev
```

Open http://localhost:3000. To validate and build:

```sh
npm run check
npm run build
```

The production output is `dist/`. Deploy it to a static host. All navigation uses hash routes so nested views work on static hosting and GitHub Pages project paths without server rewrites. No deployment or hosting account is provisioned by this repository.

## Included

- Cinematic responsive home page with discovery controls.
- 28 destination guides; search, spelling aliases, region and travel-style filters.
- Saved destinations persisted locally with storage-failure handling.
- Three sample journeys with accessible native-dialog itineraries.
- Field notes index and individual editorial articles.
- About / philosophy and privacy / information pages.
- Three-step planner with dates, group size, pace and user-defined budget.
- Editable trip brief, browser-local saving and downloadable text export.
- Mobile navigation, keyboard focus states, reduced-motion support and motion toggle.
- Self-hosted photography, no fonts or scripts from third-party CDNs.
- Content/asset tests and a GitHub Actions validation workflow.

## Edit the content

`data.js` contains all destination introductions, suggested durations, experiences, journeys and articles. `app.js` owns views, routing and browser state. `styles.css` contains the complete visual system and responsive breakpoints.

## Scope and launch requirements

This is a working **travel-guide and personal-planning frontend**, not a reservation or payment backend. No enquiries are sent. The interface clearly states that plans remain on the device, routes are sample itineraries, and budgets are entered by the traveler rather than supplier quotes.

Before commercial booking launch, connect an authenticated backend/CRM, verify suppliers and availability, implement enquiry delivery, establish actual business contact details and booking policies, and obtain destination-specific editorial review. Confirm the precise locality/map coordinates for Samsu and Kolbong. North/South/East/West Sikkim are used as travel-region labels. Permit links point to official authorities; no live conditions or weather are claimed.

Do not insert fabricated reviews, live availability, discounts or destination-specific imagery without verification. Frontend local storage is not a secure store for identity documents or payment information.

## Photography

Photos are stored locally for dependable rendering. The copyright in photographs remains with their respective authors; see [ASSETS.md](ASSETS.md) for source pages and license links. Regional inspiration images are explicitly identified rather than attributed to every village.

## Validation

`npm run check` validates JavaScript syntax and tests destination IDs, route references, itinerary lengths, editorial content and JPEG signatures. Browser QA should cover desktop/tablet/mobile layouts, filters, local saving, dialogs, planner export, keyboard access, reduced motion and storage failures.
