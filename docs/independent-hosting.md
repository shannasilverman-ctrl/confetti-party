# Independent hosting

Confetti's application source, build, AI calls, and runtime are independent
of a visual app builder. The existing Lovable beta remains a rollback target
until the standalone deployment passes acceptance and the production domain
is deliberately moved.

## Runtime

- Cloudflare Workers serves the TanStack Start SSR application and static
  assets from one versioned deployment.
- Supabase provides Postgres and authentication.
- OpenAI is called directly by server-only routes for text and voice.
- Uploaded event photos remain outside Confetti through host-configured Photo
  Drop links.

## Required configuration

Set these as Cloudflare Worker secrets or variables. Never commit their
values.

| Name                            | Visibility                  | Purpose                                |
| ------------------------------- | --------------------------- | -------------------------------------- |
| `SUPABASE_URL`                  | server                      | Supabase project URL                   |
| `SUPABASE_PUBLISHABLE_KEY`      | server + public counterpart | Authenticated RLS client               |
| `SUPABASE_SERVICE_ROLE_KEY`     | server secret               | Trusted administrative routes          |
| `VITE_SUPABASE_URL`             | build-time public           | Browser Supabase client                |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build-time public           | Browser RLS key                        |
| `OPENAI_API_KEY`                | server secret               | Text and voice planning                |
| `OPENAI_TEXT_MODEL`             | server variable, optional   | Defaults to `gpt-5.6-terra`            |
| `OPENAI_SAFETY_ID_SALT`         | server secret               | Privacy-preserving Realtime identifier |

SMS planning is deliberately inactive unless all of these staging-only
settings are present and valid:

| Name                            | Visibility    | Purpose                                     |
| ------------------------------- | ------------- | ------------------------------------------- |
| `TWILIO_ACCOUNT_SID`            | server        | Binds signed requests to one Twilio account |
| `TWILIO_AUTH_TOKEN`             | server secret | Validates the exact webhook signature       |
| `TWILIO_MESSAGING_SERVICE_SID`  | server        | Binds inbound traffic to one service        |
| `TWILIO_SMS_WEBHOOK_URL`        | server        | Exact HTTPS `/api/sms/inbound` signing URL  |
| `TWILIO_SMS_STATUS_WEBHOOK_URL` | server        | Exact HTTPS `/api/sms/status` base URL      |
| `TWILIO_SMS_TO_NUMBER`          | server        | Expected US destination number              |
| `SMS_LOOKUP_SECRET`             | server secret | Base64 256-bit HMAC key for phone lookup    |
| `SMS_RECEIPT_SECRET`            | server secret | Different base64 256-bit receipt HMAC key   |
| `SMS_ENCRYPTION_KEY`            | server secret | Base64-encoded 256-bit AES-GCM key          |
| `SMS_ENCRYPTION_KEY_ID`         | server        | Rotation id embedded in stored ciphertext   |

Do not configure a production webhook or publish a number until
`20260729123000_sms_staging_transport.sql` and the forward-only
`20260729133000_sms_delivery_status.sql` expansion have been applied to an
isolated Supabase project and `bun run test:db` passes there. Missing or
malformed SMS configuration returns a generic `503`; it does not expose a dead
product control.

Keep both environment signing URLs fragmentless. Configure the Twilio inbound
webhook with this reliability suffix:

```text
#rc=2&rp=ct,rt,5xx&ct=2000&rt=5000&tt=15000
```

Confetti appends the same suffix to every delivery callback. Twilio excludes
connection-override fragments from signature calculation, so the Worker
validates the exact base URL plus query receipt and deliberately omits the
fragment. The two retries cover connection, read-timeout, and HTTP 5xx failures;
4xx remains non-retryable.

## Safe release sequence

1. Build and run the full automated suite from a clean commit.
2. Deploy the exact green commit to
   `confetti-independent-preview.shannasilverman-apps.workers.dev`.
3. `bun run deploy:preview` automatically retries
   `bun run verify:deployment` across normal edge propagation. Then run desktop
   and mobile acceptance against that exact deployment.
4. Add the production secrets to the Worker without printing or copying them
   into source control.
5. Attach `www.confettiapp.ai` as a Cloudflare Worker custom domain only after
   the preview is signed off.
6. Keep the Firebase and Lovable deployments unchanged during a rollback
   window; remove them only after production traffic is stable.

The domain move is intentionally separate from code deployment because DNS and
custom-domain changes affect the existing public site.

## Deterministic rollback

A rollback changes Worker traffic immediately, so the repository command is a
dry run unless `--execute` is explicitly present. It also requires both the
Cloudflare version UUID and the full Git release SHA; aliases such as `latest`
are rejected.

1. Freeze further deploys and capture the failing SHA from `/release.json`.
2. Run `bun run deployments:list` and select a previously verified version.
   New deployments include `Confetti release <full-sha>` in their Cloudflare
   version message so version-to-code identity is reviewable.
3. Preview the operation without changing Cloudflare:

   ```sh
   bun run rollback:preview -- --version <version-uuid> --release <full-git-sha>
   ```

4. After incident approval, repeat the exact command with `--execute`.
5. The command rolls traffic back and then runs the same live exact-SHA,
   route, PWA, MIME, HTTPS, and security-header verification used after a
   normal deploy. A mismatch or unhealthy edge exits non-zero.

Worker rollback does not revert Supabase schema or data. If an incident
includes a database migration, use that migration's reviewed recovery plan;
never infer a database rollback from the Worker version alone.
