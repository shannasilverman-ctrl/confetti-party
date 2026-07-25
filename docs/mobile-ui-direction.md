# Mobile and UI direction

Confetti remains a responsive web app and installable PWA for this release.
Rewriting it in Expo would duplicate a working product before the core host
workflow is validated. Expo is the candidate for a later native shell when
push notifications, share extensions, deeper camera integration, or app-store
distribution justify maintaining a second client.

## Applied now

- source-owned Radix/Tailwind components stay composable in the shadcn model;
  no big-bang component overwrite
- minimum 44×44 px primary mobile controls
- safe-area padding for bottom navigation and focused host modes
- one-thumb Day-of actions and compact workspace navigation
- installable manifest, branded icons, and an install prompt
- reduced-motion fallback for the party-scene carousel
- mobile matrices at 320, 375, 390, and 430 px
- keyboard, focus return, overflow, and serious/critical axe checks

## Native trigger

Consider an Expo shell only after the web funnel proves repeat usage and a
native-only capability materially improves retention. Keep the domain model,
API contracts, event templates, and recommendation engine client-agnostic so a
future Expo app can reuse them.
