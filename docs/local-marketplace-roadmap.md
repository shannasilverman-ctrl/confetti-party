# Local planning and marketplace roadmap

## What ships now

Confetti translates the occasion, location, and plan into useful local paths:
venue types, food/catering searches, experiences, and at-home alternatives.
Searches open current Google Maps results so the app does not invent
businesses, ratings, hours, prices, or availability.

This is the honest first slice of a marketplace: it helps the host ask a
better local question without pretending Confetti can book inventory it does
not yet own.

## Next marketplace layer

Build a provider adapter with normalized fields for:

- stable provider and venue identity
- service area and travel radius
- occasion, capacity, accessibility, and dietary fit
- package inclusions and price basis
- rating source, review count, and last refresh time
- availability source and last refresh time
- booking/deep-link capability
- disclosure for sponsored or affiliate placement

Start with one metro and two high-intent categories—kids’ birthday venues and
easy catering—before adding broad discovery. A host should be able to compare
three genuinely available options, understand the full package, and book or
request without re-entering the event brief.

## Ranking contract

Rank by hard constraints first (location, date, capacity, budget,
accessibility, dietary needs), then host fit and convenience. Never let paid
placement override a failed constraint. Clearly label estimates, affiliate
relationships, stale availability, and results that leave Confetti to book.

## Success gate

The marketplace is ready to call “bookable” only when Confetti can show the
source and freshness of price, rating, and availability; handle provider
failures; preserve the host’s event context; and confirm the booking state
back in the plan.
