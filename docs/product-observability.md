# Product observability without personal tracking

Confetti emits a deliberately small set of structured product events to the
Cloudflare Worker log. The purpose is to answer two launch questions:

1. Are hosts reaching a useful plan?
2. Are invitations, RSVPs, and saves failing?

This is aggregate operational evidence, not person-level analytics. It must not
be described as unique-user, retention, cohort, attribution, or conversion data.

## Privacy contract

The browser sends only:

- one event from the compile-time allowlist; and
- one broad surface such as `talk`, `quick_start`, or `rsvp`.

The request omits credentials and the referrer. Dynamic party IDs and RSVP
bearer tokens are reduced to fixed surface names before the request is built.
The endpoint rejects unknown fields, free text, unknown values, non-JSON bodies,
and bodies over 256 bytes. The server adds only the deployed release SHA and a
fixed `product_event` type. It does not read request headers, IP metadata,
cookies, account state, or Cloudflare request metadata into the event record.

Do not add user IDs, session IDs, party IDs, invite tokens, guest responses,
names, email addresses, typed planning text, exception messages, URLs, or
arbitrary properties. A new dimension requires a privacy review and a test that
proves dynamic route values cannot enter the payload.

## Event dictionary

| Event                  | Meaning                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `landing_plan_started` | A visitor chose a landing-page planning CTA                      |
| `planning_started`     | A host sent the first Talk planning turn                         |
| `plan_created`         | Talk or Quick Start produced an editable workspace               |
| `invite_opened`        | A real or explicitly labeled sample invitation rendered          |
| `rsvp_completed`       | An RSVP submission was acknowledged, with no answer value logged |
| `bring_item_claimed`   | A bring-board claim was acknowledged                             |
| `party_save_failed`    | An authenticated party write exhausted its safe save path        |
| `rsvp_failed`          | An RSVP mutation returned or threw an error                      |
| `client_render_failed` | The application route error boundary rendered                    |

Sample actions remain separate because their surface is `sample_invite`.

## Release readout

For an exact release, filter structured Worker logs to:

```text
type = "product_event"
release = "<40-character release SHA>"
```

Then report raw event counts by `surface`. Useful directional ratios are:

- plan completion = `plan_created / max(landing_plan_started, planning_started)`;
- real RSVP acknowledgement =
  `rsvp_completed[rsvp] / (rsvp_completed[rsvp] + rsvp_failed[rsvp])`; and
- save failure pressure =
  `party_save_failed / plan_created`.

These are event ratios, not user conversion rates. Repeated attempts, reloads,
blocked automation, and log sampling can change them. Always include the release,
time window, environment, raw numerator and denominator, and whether Cloudflare
log sampling was enabled.

## Operational check

Use the Cloudflare dashboard for the deployed Worker or stream an authorized
environment with Wrangler:

```sh
npx wrangler tail <worker-name> --format json
```

Exercise one non-sensitive sample flow and confirm that the log contains only
the four server-owned keys `type`, `event`, `surface`, and `release`. Never use a
real RSVP token merely to test telemetry. Alerting and retained dashboards are
environment-owner decisions because they can introduce another processor,
retention policy, or secret.
