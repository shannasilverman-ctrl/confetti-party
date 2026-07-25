# Active plan

Confetti is in beta. Prior batch history and the full RC audit gap register live in
[`docs/rc-audit.md`](../docs/rc-audit.md). Prior security hardening and phase notes
are preserved in `PHASE4_QA.md`, `TESTING.md`, `OPENAI_REALTIME.md`, and
`RELEASE_NOTES.md`.

## Currently in flight

Corrective QA batch on top of the Talk materialization work:

- Signup / resend uses `supabase.auth.resend({ type: "signup" })`; password is
  never re-sent. Signup is session-aware — auto-nav to `/app` when confirmation
  is disabled.
- `deleteParty` uses an in-session tombstone to prevent queued/in-flight saves
  from resurrecting a deleted row, requires an RLS-scoped delete return, and
  rolls back only the target row on failure.
- Demo `localStorage` is versioned (`confetti:demo:v2`), zod-validated, and
  splits seeded samples from user-created parties so app updates aren't
  shadowed by stale snapshots. Size cap is enforced in UTF-8 bytes; the user
  is truthfully warned on corrupt / quota / oversized state.
- Delete action is reachable in the party workspace at 360 px width.
- `/privacy` and `/terms` no longer imply features we do not ship (account
  deletion, specific contact channel, guaranteed live voice) and are clearly
  labeled beta product information, not legal counsel.
- `LegalFooter` is present on `/`, `/app`, and `/rsvp/:token`.

## Next up (post-batch)

- Real-user smoke of signup → confirm → sign-in → create → delete → sign-out
  → sign-in-again → verify persistence. Requires live SMTP.
- Multi-worker distributed voice rate-limit — still deferred (documented in
  `OPENAI_REALTIME.md`).
