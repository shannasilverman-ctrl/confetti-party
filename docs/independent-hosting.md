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

## Safe release sequence

1. Build and run the full automated suite from a clean commit.
2. Deploy the exact green commit to
   `confetti-independent-preview.shannasilverman-apps.workers.dev`.
3. Run `bun run verify:deployment`, then desktop and mobile acceptance against
   that exact deployment.
4. Add the production secrets to the Worker without printing or copying them
   into source control.
5. Attach `www.confettiapp.ai` as a Cloudflare Worker custom domain only after
   the preview is signed off.
6. Keep the Firebase and Lovable deployments unchanged during a rollback
   window; remove them only after production traffic is stable.

The domain move is intentionally separate from code deployment because DNS and
custom-domain changes affect the existing public site.
