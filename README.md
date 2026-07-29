# Confetti

The operating system for hosting gatherings. Confetti takes a host from the
first idea through the final toast and the next gathering. It is not
primarily an invitation maker; RSVP links are one small surface on top of a
full planning workspace.

## Product promise

Confetti supports **any** gathering through composable dimensions and content
packs — birthdays, weddings, Shabbat, holiday meals, cookouts, watch parties,
dinner parties, showers, graduations, and custom events. Never assume a
domain (birthday-only), religion, age, dietary practice, culture, or team
affiliation.

Core journey:

```text
Talk it out → Party Reveal → Next Three Things → Guest World / Bring Board
             → Day-of Mode → Memories / retrospective
```

## Architecture

TanStack Start (React 19 + Vite 8) rendered on Cloudflare Workers, with
Supabase (Postgres + Auth) as the durable store. AI features call OpenAI
directly from server-only handlers.

```text
Browser ──▶ TanStack Router ──▶ Route loader ──▶ createServerFn (worker)
                                      │                 │
                                      ▼                 ▼
                              TanStack Query    Supabase (RLS + SECURITY
                                                DEFINER RPCs for tokens)
                                                        │
                                                        ▼
                                                OpenAI API
```

- **UI**: `src/routes/*` (file-based), `src/components/*`, `src/lib/*`.
- **Server**: `src/lib/*.functions.ts` (createServerFn), `src/routes/api/*`
  (raw HTTP webhooks / public endpoints).
- **Persistence**: `src/lib/party-store.ts` + `src/lib/party-persistence.ts`
  own the optimistic-concurrency mutation queue. Never call the Supabase
  client directly from components for party writes.
- **Guest surfaces** (`/rsvp/:token`, `/party-pass/:token`) never require
  auth and only touch SECURITY DEFINER RPCs that strip host PII.

## Local setup

Prerequisites: Bun (version pinned in `package.json` `packageManager`).

```bash
bun install --frozen-lockfile
bun run dev            # http://localhost:8080
```

Copy `.env.example` to a local `.env` and fill in development values. Never
commit real Supabase or OpenAI keys. Anything the client needs must be
prefixed `VITE_`; secrets stay unprefixed and are read inside `.handler()`
bodies only.

## Tests

| Command                      | What it runs                                                    |
| ---------------------------- | --------------------------------------------------------------- |
| `bun run audit:prod`         | High/critical production dependency advisory gate               |
| `bun run format:check`       | Prettier drift gate                                             |
| `bun run lint`               | ESLint (0 warnings tolerated in CI)                             |
| `bun run typecheck`          | `tsc --noEmit`                                                  |
| `bun run test`               | Vitest unit + integration                                       |
| `bun run test:coverage`      | Vitest with V8 coverage                                         |
| `bun run test:e2e`           | Playwright end-to-end (desktop + mobile)                        |
| `bun run test:db`            | Postgres RPC harness (requires local Postgres; skipped in CI)   |
| `bun run rehearse:migration` | Redacted Firebase shadow migration rehearsal (requires key env) |
| `bun run verify:deployment`  | Exact-release, route, installability, and security smoke check  |

The E2E suite spawns a real production server via `wrangler dev`. If the
sandbox lacks system libraries (`libglib-2.0.so.0`), tests fail at browser
launch — this is a sandbox limitation, not a code regression. CI runs the
full suite on `ubuntu-latest`.

## Demo vs authenticated behavior

- **Signed-out visitors** see a local-only demo workspace hydrated from
  `src/lib/demo-storage.ts` (Zod-validated schema, `localStorage`-backed).
  Demo edits never hit Supabase. Confetti bursts and RSVP-copy affordances
  work; the save-status pill and the "Not saved to the cloud" recovery card
  are hidden — demo state is never conflicted with a server row.
- **Signed-in hosts** get real persistence through the mutation queue with
  visible saving/saved/offline/error/conflict states.
- **Guests** (anyone with an RSVP token URL) never sign in. Their claims
  are receipt-based (`claimSecret` in `localStorage` only).

## Deployment boundaries

- Cloudflare Workers runtime — no native modules, no `child_process`, no
  `sharp`. See `docs/rc-audit.md` for the current unsupported-package list.
- Cloudflare KV / R2 are not used; large media (uploaded photos) live
  externally via Photo Drop provider links, never on Confetti.
- Custom domains are managed by the workspace owner. Do not attempt to
  publish or rebind domains from the agent.

## Further docs

Detailed release-engineering docs live under `docs/`:

- `docs/release-signoff.md` — current beta scope, verification evidence, and
  explicit unverified boundaries.
- `docs/rc-audit.md` — historical release-candidate gap register used to
  drive the hardening work.
- `docs/testing.md` — expanded test strategy (was root `TESTING.md`).
- `docs/openai-realtime.md` — Talk voice pipeline notes (was root
  `OPENAI_REALTIME.md`).
- `docs/phase4-qa.md` — accessibility / mobile QA evidence trail.

The root `AGENTS.md` documents agent-facing rules and is not required
reading for humans.

## Security posture

- Every `public` table has explicit `GRANT`s aligned with its RLS policies.
- Token RPCs (`submit_rsvp`, `claim_bring_item`, `release_bring_item`,
  `get_rsvp_party`, `list_bring_board`) revoke public execute; access flows
  through SECURITY DEFINER with input validation and row locking.
- Bring Board claims return the `claimSecret` exactly once. Release
  requires that receipt — never the guest name.
- Public projections never expose host PII (dietary tags, allergens, notes,
  claimant identity).

Report anything that looks like a leak or RLS bypass in `docs/rc-audit.md`
before shipping.
