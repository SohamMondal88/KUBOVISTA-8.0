# Membership page

Route: `#/membership`. Linked from the Discover menu and footer. This is a membership preview and interest flow, not a recurring billing implementation.

## Recommended initial offer

- Explorer: no membership fee; existing public guides and planning tools. Account and Travel Date features remain subject to their existing activation and eligibility rules.
- Explorer Plus: proposed ₹999/year, two human itinerary reviews and one revision per review.
- Travel Circle: proposed ₹2,499/year, four itinerary reviews with group budget/room planning and one revision per review.

These are suggested launch prices, not established market rates, approved operational commitments or guaranteed offers. Confirm staff capacity, per-review scope, actual delivery cost and final tax-inclusive prices before selling. There are no invented discounts, savings claims, priority companion matches, free stays or included trip costs.

## Interest flow

Paid-plan buttons route to the existing Contact page with a descriptive subject including the selected plan and proposed price. They use the existing general-contact enquiry type, so no database migration, payment change or new serverless function is required. When enquiry services are configured, submissions appear in the existing admin enquiry inbox. When unavailable, the contact page displays its existing company contact fallback and does not claim a successful registration.

The finder recommends free tools for exploration or one-off trips, paid-plan discussions for repeat planning, and an adult-organiser quotation for school trips. Answers are used only in page memory; no quiz profile is stored or transmitted.

## Before selling memberships

Approve final benefits, service limits, fulfilment capacity and renewal/cancellation/refund terms. Implement a separate membership product and entitlement model with appropriate payment verification and lifecycle handling. Existing Razorpay trip-payment endpoints must not be reused as if they create membership subscriptions. There is no automatic renewal or active paid member status in this release.

Pricing, plan copy, comparison rows and recommendations are in membership.js; styling is in membership.css. Public status remains Coming soon until actual activation is implemented. Update the page and legal disclosures together when the offer changes.

Validation: membership syntax and the existing 51-test suite passed; production assets build into dist; function count remains 10. Responsive breakpoints, reduced motion and accessible labels/focus states are implemented. Visual browser verification was not completed in this environment.
