# Confetti text-message planning project

Status: Slice 1 is complete. Slice 2 now has an inactive secure transport,
reviewed schema, and local contract tests. It still requires the rollback-only
database harness in isolated staging before activation. No phone number, paid
provider, production data, production schema, or production webhook has been
created.

Owner outcome: a host can text Confetti in ordinary language, receive one useful
question at a time, build a real party draft, and continue the same plan in the
web app without repeating answers.

## Product promise

The first message should feel as easy as texting a capable friend:

> “I’m planning my husband’s 54th birthday for about 25 people in October.”

Confetti replies with its identity, reflects the facts it understood, and asks
one high-value question:

> “Confetti here. I have a 54th birthday for about 25 people in October. What
> should the night feel like: relaxed conversation, a lively celebration, or
> something else? Reply STOP to opt out.”

The conversation should create useful structure immediately. It should not
pretend a complete plan exists after one vague message, and it should not make a
host answer questions Confetti can safely leave open.

This borrows the useful interaction principle demonstrated by
[Stanley](https://www.getstanley.ai/welcome)—start the relationship from a
message—without copying its brand or treating SMS as a disconnected assistant.

## End-to-end journey

1. A host visits a truthful “Plan by text” surface or texts the published
   Confetti number.
2. Confetti identifies itself, acknowledges the message, includes opt-out
   language, and asks one next-best question.
3. Every answer updates one server-side `DraftPatch`, using the same planning
   vocabulary and materialization rules as the web app.
4. Confetti sends compact summaries at natural checkpoints and lets the host
   correct a fact in plain language.
5. Once the draft is useful, Confetti sends a short-lived “Continue your plan”
   link.
6. The browser shows the captured facts before asking the host to sign in or
   claim the plan.
7. Claiming creates or attaches the party once, records consent and provenance,
   and invalidates the claim token. The SMS thread can then continue against
   that party only after an explicit link.

The phone number is a conversation address, not an authentication factor. A
recycled or shared phone number must not silently grant access to an existing
Confetti account or party.

## Recommended first release

Start with US, host-initiated, one-to-one planning only.

Included:

- inbound host messages and immediate replies;
- birthday and general-gathering intake;
- correction, restart, help, stop, and resume commands;
- age/audience-aware planning;
- secure browser handoff;
- delivery status, failure recovery, rate limits, and operational alerts;
- a clear SMS disclosure and privacy/retention controls.

Not included:

- guest invitations or marketing broadcasts;
- proactive reminders;
- group texts;
- payments or vendor booking;
- account recovery by phone number;
- media messages;
- international messaging.

Those exclusions keep the first consent model understandable and prevent a
planning pilot from quietly becoming a bulk-messaging system.

## Technical shape

```text
Host phone
  -> Twilio Messaging Service
  -> POST /api/sms/inbound
  -> validate Twilio signature against the exact public URL
  -> normalize sender to E.164 and enforce rate limits
  -> load SMS conversation + draft from Supabase
  -> run deterministic fact extraction and conversation policy
  -> optionally call the server-side planning model for phrasing/clarification
  -> persist inbound event, draft revision, and outbound intent atomically
  -> return TwiML reply
  -> Twilio delivery-status webhook

Useful draft
  -> one-time hashed claim token with short expiry
  -> /continue/text/:token
  -> preview captured facts
  -> authenticate or create account
  -> atomically claim once
  -> redirect to the normal party workspace
```

Use Twilio Programmable Messaging webhooks for the first release. Twilio
documents inbound message webhooks and outbound delivery callbacks directly;
Conversations is not required for a single-host SMS thread:
[Messaging webhooks](https://www.twilio.com/docs/usage/webhooks/messaging-webhooks).

### Reuse, do not fork

- Reuse `analyzePlanningIdea`, `DraftPatch`, `mergeDraftLog`, and
  `materializeDraft`.
- Put transport-independent conversation decisions in
  `src/lib/sms-planning.ts`; Twilio-specific validation and TwiML belong at the
  server boundary.
- Store the structured draft, not an AI-generated checklist.
- Treat any model response as untrusted presentation. Validate every proposed
  patch against the same bounded schemas used by the web planner.
- Keep provider credentials and model keys server-side.

### Proposed data

All new tables require an reviewed, rehearsed Supabase migration before use.

- `sms_contacts`: encrypted E.164 value, keyed hash for lookup, consent state,
  consent source/time, opt-out time, locale, retention deadline.
- `sms_conversations`: contact, status, current draft JSON, draft version,
  linked user/party only after claim, last activity, failure counter.
- `sms_messages`: provider message ID (unique), direction, minimal body or
  redacted body according to retention policy, delivery state, timestamps.
- `sms_claims`: hashed random token, conversation, expiry, claimed-at,
  claimed-by; never store the plaintext token.
- `sms_events`: append-only security/consent transitions without message
  content.

RLS should deny client access to all raw SMS tables. Only narrowly scoped
server functions may read or write them. The web claim exchange should return a
sanitized draft preview, never the phone number or conversation transcript.

## Conversation rules

The planner must:

- ask one question per message;
- reflect captured facts before asking for more;
- distinguish “unknown” from a default;
- accept corrections such as “Actually she is turning 55”;
- recognize adult, teen, school-age, and preschool birthdays before suggesting
  format, timing, activities, or venues;
- never infer culture, religion, family structure, alcohol use, gender, or
  accessibility needs;
- make “skip,” “not sure,” “start over,” and “continue online” work anywhere;
- respond to `STOP`, `START`, and `HELP` before any AI or product logic;
- avoid putting addresses, guest lists, invitation tokens, or private party
  details into text messages unless the host explicitly requests a safe summary;
- fall back to a deterministic acknowledgement if the planning model is slow or
  unavailable.

## Reliability and security gates

- Validate every Twilio signature with the auth token and exact webhook URL.
- Deduplicate by provider message SID before processing.
- Use a database transaction or outbox so retries cannot create two plans or
  send conflicting replies.
- Rate-limit by keyed phone hash and by provider account.
- Redact phone numbers, message bodies, and claim tokens from logs and error
  reports.
- Encrypt phone numbers separately from the lookup hash and rotate encryption
  keys.
- Expire unclaimed drafts and delete message content on the published retention
  schedule.
- Use a cryptographically random, single-use, short-lived claim token.
- Require normal authentication before a claimed draft becomes durable account
  data.
- Test duplicate webhook delivery, out-of-order delivery receipts, provider
  timeout, model timeout, opt-out races, recycled numbers, and expired claims.
- Alert on webhook signature failures, elevated send failures, queue age, and
  repeated planner failures without logging message content.

## Consent and carrier setup

For US long-code messaging, Twilio requires A2P 10DLC registration, including a
brand and campaign with a documented opt-in flow, HELP behavior, and STOP
behavior. Registration review is not instant:
[Twilio A2P 10DLC overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc?save_locale=en-us)
and
[campaign approval practices](https://help.twilio.com/articles/11847054539547-A2P-10DLC-Campaign-Approval-Best-Practices).

Consent to text must be specific to SMS and not hidden inside general terms.
Twilio’s compliance guidance also requires clear sender identification and
opt-out handling:
[SMS compliance guidance](https://help.twilio.com/articles/4408675845019-SMS-Compliance-and-A2P-10DLC-in-the-US).

Before registration, publish the exact opt-in surface the campaign submission
will reference. It should show:

- Confetti’s name and what messages the host will receive;
- that message frequency varies;
- “Message and data rates may apply”;
- “Reply STOP to opt out; HELP for help”;
- links to Privacy and Terms;
- that consent is not a condition of purchase;
- an unchecked, SMS-specific consent control when the website initiates a text.

## What the owner needs to enable

Nothing is required to continue local product and test work. To activate a
staging phone number, the owner will need to approve or provide:

1. A Twilio account with billing and permission to create a Messaging Service.
2. A US SMS-capable number and the initial monthly/spend ceiling.
3. A2P 10DLC brand and campaign registration using the final published opt-in
   language, or an explicitly chosen verified toll-free alternative.
4. Staging secrets:
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_MESSAGING_SERVICE_SID`, and a claim-token encryption/pepper secret.
5. A staging Supabase project or explicit approval for the reviewed SMS schema
   migration in the existing non-production project.
6. Final Privacy/Terms language and a retention period for message content.
7. The first operating region (US-only recommended), support contact, and
   escalation owner.
8. If adaptive model-written questions are enabled, the server-side model
   credential and a small monthly budget. Deterministic planning can be tested
   before this.

Do not paste these credentials into chat, code, issues, screenshots, or PR
comments. Add them through the deployment provider’s encrypted secret controls.

## Product surfaces

Only surface features that actually work in the deployed environment:

- Home: “Plan by text” next to the existing web/talk entry, with required
  disclosure before revealing or texting the number.
- App: “Continue a text plan” claim entry, plus a visible provenance note after
  claim.
- Party overview: “Text Confetti about this plan” only after the host explicitly
  links that phone thread to the party.
- Settings: linked phone, consent status, unlink, export, and delete.
- Operations: delivery/failure metrics without raw phone numbers or message
  content.

If SMS is not configured, these controls must not render. Do not ship a dead
button or “coming soon” flow.

## Delivery slices and acceptance gates

### Slice 1 — transport-independent planner

- Pure SMS state machine and deterministic replies.
- Adult/preschool age boundaries and correction tests.
- STOP/START/HELP/restart/resume tests.
- No provider, database, or secrets required.

### Slice 2 — secure staging transport (implemented, activation gated)

- Reviewed migration and RPC-only persistence with encrypted phone/replies,
  keyed lookup/body digests, 30-day unclaimed retention, 180-day replay
  tombstones, and content-free consent events.
- Signed inbound Twilio webhook using the exact configured HTTPS URL and every
  provider parameter. Account, Messaging Service, US sender, destination,
  body, and no-media boundaries are checked only after signature validation.
- Transactional provider-SID idempotency, optimistic version retry,
  per-contact and service-wide budgets, one rate-limit notice, silent
  duplicate TwiML, redacted observability, and deterministic failure behavior.
- Official Twilio SDK signature fixtures plus local route, cryptography,
  privacy, and schema contract tests.

Still required before Slice 2 can be called active:

- apply the migration to an isolated staging Supabase project and pass
  `bun run test:db`, including its duplicate, consent, rate-limit, and rollback
  assertions;
- configure staging secrets and deploy an isolated Worker;
- send signed provider fixtures to the exact deployed route and verify cold
  start and latency;
- implement and test the signed delivery-status callback before a real-number
  pilot.

### Slice 3 — web handoff

- One-time claim link and sanitized preview.
- Authentication, claim race, expiry, replay, and unlink tests.
- Claimed party is identical to the SMS draft and opens in the normal app.

### Slice 4 — compliant pilot

- Approved opt-in page, Privacy, Terms, HELP, STOP, retention, and support path.
- Registered sender and exact staging deployment smoke-tested on real iOS and
  Android devices.
- Small invited pilot; no guest or marketing messages.

### Slice 5 — production readiness

- Delivery, opt-out, failure, latency, claim, and activation metrics reviewed.
- Abuse and incident runbook rehearsed.
- Rollback disables inbound processing and hides entry points without losing
  claimed parties.
- Production activation and spend ceiling receive explicit owner approval.

The project is not “flawless” because a happy-path text works. It is ready when
duplicate delivery, correction, opt-out, provider failure, secure claim,
retention, accessibility of the web handoff, and exact deployed-release tests
all pass.
