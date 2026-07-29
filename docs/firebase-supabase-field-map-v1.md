# Firebase → Supabase field map v2

Status: rehearsal-only; production migration remains blocked.

The machine-readable contract is
`tools/migration/firebase-field-map-v1.json` (the historical filename is
retained so existing operator commands fail predictably rather than selecting a
different file). Its immutable contract version is `firebase-supabase-v2`.
The dry-run planner rejects every leaf path that is unclassified or matches
multiple equally specific rules.
The credential-free shadow rehearsal then validates relationships and types,
builds logical target rows only in memory, proves identical replay is
idempotent, and reconciles the expected and observed shadow target sets. Its
report emits only counts and domain-separated keyed digests—never source keys,
names, emails, event codes, tokens, messages, URLs, object paths, raw content
hashes, or transformed rows.

The rehearsal pins the reviewed canonical field-map digest and an explicit
consumer for every `migrate` decision. Any decision, destination, PII
classification, or rule change requires a new version and matching transform
review; a changed map cannot be compared with or applied to the same ledger.

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
| Guest planning/RSVP fields        | migrate                  | Name, kind, RSVP, dietary/allergen fields; sensitive, least-privilege staging    |
| Legacy guest/member email fields  | archive                  | Never used to link identities; digest-only archive manifest in rehearsal         |
| Event vendor selections           | archive                  | Preserve until the new vendor model exists                                       |
| Vendor profiles                   | archive                  | No production cutover until a reviewed destination exists                        |
| Bookings, threads, attachments    | archive                  | Preserve timestamps and object hashes; destination not implemented               |
| Storage objects                   | migrate later            | Inventory path, size, MIME type, hash, authorization; prove copy and restore     |
| Canva/payment/integration tokens  | reauthorize              | Never copy access/refresh tokens                                                 |
| RSVP/collaboration codes          | archive + resolver input | Server-only HMAC lookup; separate scopes; never a new bearer credential          |

## Rehearsal protocol

1. Export immutable Auth, Firestore, Storage, rules, indexes, functions, and
   provider configuration. Prove a restore before transforming anything.
2. Run the shadow rehearsal on sanitized staging data with an explicit
   ephemeral HMAC key and non-secret key ID. Unknown/ambiguous fields,
   unresolved relationships, malformed domain values, duplicate entities,
   stale timestamps, and reconciliation differences fail the run. Review a
   new version of this map rather than ignoring them.
3. Review the redacted report. Success must show a zero-difference
   reconciliation and an identical second apply with zero creates or updates.
   This is still only an in-memory rehearsal.
4. Import idempotently into isolated staging using service-only ledgers.
5. Reconcile counts, identities, memberships, source timestamps, keyed
   payload hashes, and Storage hashes. Zero unexplained rows is required.
6. Take a second source snapshot and explain every delta. Removed records
   require an explicit tombstone decision and never cause an automatic delete.
   Firebase remains
   authoritative; no browser dual-write.
7. Before any cutover, rehearse write freeze, final delta, service-worker
   retirement, canary, reverse reconciliation, and rollback.

This field map is deliberately incomplete for a production export until the
missing deployed Firebase rules, functions, indexes, provider configuration,
and real schema inventory are recovered. The in-memory ledger is not evidence
for Postgres constraints, RLS, or a production importer. Those are blockers,
not fields to silently retire.
