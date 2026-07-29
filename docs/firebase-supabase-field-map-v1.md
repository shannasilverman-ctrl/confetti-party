# Firebase → Supabase field map v1

Status: rehearsal-only; production migration remains blocked.

The machine-readable contract is
`tools/migration/firebase-field-map-v1.json`. The dry-run planner rejects every
leaf path not classified there. It emits counts and hashes only—never source
keys, names, emails, event codes, tokens, messages, or raw payloads.

## Identity boundary

An identity is `(source_system=firebase, source_tenant=confetti-d8be9,
Firebase UID)`. Email is never a linking key. A link becomes `verified` only
after a valid Firebase ID token for the expected project and an authenticated
Supabase session prove both sides. Password, Google, and Apple users require
reauthentication; Firebase sessions, password hashes, provider credentials,
and Apple relay-email assumptions are not portable.

Planner and vendor profiles are roles attached to one Firebase identity, not
separate people merely because the legacy UI uses two Firebase clients.

## Classification

| Source                            | Decision                 | Destination / rule                                                               |
| --------------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Auth UID and providers            | migrate + reauthorize    | Hash UID into the service-only identity map; re-prove every provider             |
| `users/{uid}` event code/name     | migrate                  | Membership reconciliation only; legacy code never becomes authority              |
| FCM tokens                        | reauthorize              | Retire tokens and register new devices after opt-in                              |
| `events/{code}` owner/member data | migrate                  | Verified identities → owner/cohost memberships                                   |
| Event plan fields                 | migrate                  | Explicit transforms into `parties`; preserve source timestamp and canonical hash |
| Pending email invitations         | archive                  | Do not email-match or honor legacy role/client claim logic                       |
| Guests and dietary/access data    | migrate                  | Sensitive; encrypted transport, least-privilege staging, no logs                 |
| Event vendor selections           | archive                  | Preserve until the new vendor model exists                                       |
| Vendor profiles                   | archive                  | No production cutover until a reviewed destination exists                        |
| Bookings, threads, attachments    | archive                  | Preserve timestamps and object hashes; destination not implemented               |
| Storage objects                   | migrate later            | Inventory path, size, MIME type, hash, authorization; prove copy and restore     |
| Canva/payment/integration tokens  | reauthorize              | Never copy access/refresh tokens                                                 |
| RSVP/collaboration codes          | archive + resolver input | Server-only HMAC lookup; separate scopes; never a new bearer credential          |

## Rehearsal protocol

1. Export immutable Auth, Firestore, Storage, rules, indexes, functions, and
   provider configuration. Prove a restore before transforming anything.
2. Run the dry-run planner on sanitized staging data. Unknown fields fail the
   run; update and review this versioned map rather than ignoring them.
3. Import idempotently into isolated staging using service-only ledgers.
4. Reconcile counts, identities, memberships, source timestamps, canonical
   payload hashes, and Storage hashes. Zero unexplained rows is required.
5. Take a second source snapshot and explain every delta. Firebase remains
   authoritative; no browser dual-write.
6. Before any cutover, rehearse write freeze, final delta, service-worker
   retirement, canary, reverse reconciliation, and rollback.

This field map is deliberately incomplete for a production export until the
missing deployed Firebase rules, functions, indexes, provider configuration,
and real schema inventory are recovered. That is a blocker, not a field to
silently retire.
