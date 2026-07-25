# OpenAI Realtime integration

Confetti's "Talk it out" voice mode uses OpenAI's Realtime API over WebRTC
from the browser, with a short-lived ephemeral client secret minted
server-side.

**Contract dated:** 2026-01 — verified against OpenAI's current
`/v1/realtime/client_secrets` mint flow and `gpt-realtime-2.1` model.

## Contract

| Field                 | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Endpoint (mint)       | `POST https://api.openai.com/v1/realtime/client_secrets`                   |
| Endpoint (WebRTC SDP) | `POST https://api.openai.com/v1/realtime?model=<model>`                    |
| Model                 | `gpt-realtime-2.1`                                                         |
| Voice                 | `marin` (change only with a tested product reason)                         |
| Transport             | WebRTC from the browser                                                    |
| Beta header           | **Not sent.** `OpenAI-Beta: realtime=v1` is removed.                       |
| Deprecated            | `POST /v1/realtime/sessions` and `gpt-4o-realtime-preview-*` are not used. |

The mint request body follows the current nested schema, built by
`buildRealtimeSessionBody` in `src/lib/realtime-session.ts`:

```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2.1",
    "instructions": "...Confetti voice prompt...",
    "audio": {
      "input": {
        "transcription": { "model": "gpt-4o-mini-transcribe" },
        "turn_detection": { "type": "server_vad", ... }
      },
      "output": { "voice": "marin" }
    }
  }
}
```

## Auth boundary

- `OPENAI_API_KEY` is server-only and read only inside the
  `/api/realtime/session` handler. It never reaches the browser.
- The browser receives only the ephemeral `client_secret.value`
  (`ek_...`) with a short expiry. It uses that secret exclusively for the
  WebRTC SDP exchange.
- The mint route is fail-closed: no bearer → 401, no `OPENAI_API_KEY` →
  503 (`voice_unavailable`), upstream failure → sanitized 502.

## Privacy / safety identifier

Each mint request includes an `OpenAI-Safety-Identifier` header derived
from the authenticated Supabase user id via SHA-256:

- Format: `conf_<32 hex chars>` (128 bits, opaque).
- **`OPENAI_SAFETY_ID_SALT` is REQUIRED** whenever `OPENAI_API_KEY` is
  configured. Missing/short salt fails closed with a sanitized `503
voice_unavailable`; the route never falls back to hashing an unsalted
  user id. Set the salt (any high-entropy string, min 8 chars) in Project
  Settings → Secrets. Rotate to invalidate all existing correlation ids.
- The raw user id, email, bearer token, IP, and any other PII are never
  sent to OpenAI, never logged, and never returned to the browser.

## Server logging

Each mint call emits a per-request `req_<16 hex>` correlation id and the
`conf_<32 hex>` safety id — nothing user-identifying. When available the
OpenAI `x-request-id` is captured so support tickets can be cross-referenced
without leaking payloads. Raw OpenAI response bodies are never logged and
never proxied to the browser.

## Rate limits and session lifecycle

Enforced server-side against `talk_sessions`:

- Max **5 mints per rolling hour** per user → `429 rate_limited`.
- Max **2 concurrent open sessions** per user → `429 too_many_concurrent`.
- Concurrency ignores rows older than **15 minutes** with no `ended_at`,
  so a crashed/refreshed browser cannot lock a user out permanently. This
  15-minute cutoff is the client-secret's practical outer bound; the
  stale row remains in the audit trail.
- The `POST /_serverFn/*` `endSession` function (bearer-authenticated,
  `requireSupabaseAuth`) is the only way a client ends its own session
  early. RLS scopes the `UPDATE` by `auth.uid()` so no user can end
  another user's session. Tests cover ownership + idempotency of the
  end path.

Fail-closed ordering inside the mint route:

1. Auth + config + rate/concurrency read. **A Supabase read error is
   NEVER treated as "zero recent sessions"** — it returns `503`.
2. Insert a reserving `talk_sessions` row. Insert failure → `503` and
   no OpenAI call is made.
3. Mint the client secret. Upstream failure → the reserved row is marked
   `ended` with a `disconnect_reason` and a sanitized `502` returned.
4. The client secret is returned only after step 2 durably reserves the
   concurrency slot.

## Failure behavior

The server returns sanitized errors — never the raw OpenAI response body:

| Condition                          | Status | `error` code                           |
| ---------------------------------- | ------ | -------------------------------------- |
| Missing `OPENAI_API_KEY` or salt   | 503    | `voice_unavailable`                    |
| Missing/invalid bearer             | 401    | (plain body)                           |
| Supabase read/write failure        | 503    | `voice_unavailable`                    |
| Rate limit hit                     | 429    | `rate_limited` / `too_many_concurrent` |
| Upstream network error             | 502    | `upstream_unreachable`                 |
| Upstream non-2xx                   | 502    | `upstream_error`                       |
| Unexpected/malformed upstream JSON | 502    | `upstream_error`                       |

## Opt-in staging smoke test

CI does **not** require `OPENAI_API_KEY` — all automated tests mock the
upstream. To run a real end-to-end smoke:

1. Set `OPENAI_API_KEY` (and optionally `OPENAI_SAFETY_ID_SALT`) in the
   staging environment's Project Settings → Secrets.
2. Sign in as a test user.
3. Visit `/talk`, switch to Voice mode, and start a session.
4. Verify in the OpenAI dashboard that the request used
   `gpt-realtime-2.1`, that `OpenAI-Safety-Identifier` is present, and
   that the client secret expires within the configured TTL.
5. Confirm a corresponding `talk_sessions` row exists for the user.

Never enable `OPENAI_API_KEY` in production without also configuring the
salt and reviewing the mint rate limits for your expected load.

## Files

- `src/lib/realtime-session.ts` — pure helpers (model/voice constants,
  body builder, safety-identifier hash, response parser).
- `src/routes/api/realtime/session.ts` — TSS server route that mints
  ephemeral secrets.
- `src/lib/talk-client.ts` — browser WebRTC client, performs the SDP
  exchange with the ephemeral secret.
- `tests/unit/realtime-session.test.ts`,
  `tests/unit/talk-client.test.ts` — mocked unit coverage.
