import { createFileRoute } from "@tanstack/react-router";
import { planSmsMessage, type SmsPlanningState } from "@/lib/sms-planning";
import {
  collectTwilioParams,
  encryptSmsValue,
  keyedDigestHex,
  normalizeE164,
  parseSmsPlanningState,
  twimlResponse,
  validateSmsEncryptionKey,
  type TwilioFormParams,
} from "@/lib/sms-transport";

const MAX_FORM_BYTES = 12 * 1024;
const MAX_MESSAGE_CHARACTERS = 1600;
const MAX_REPLY_CHARACTERS = 1500;
const MAX_CAS_ATTEMPTS = 3;
const MESSAGE_SID = /^SM[0-9A-Fa-f]{32}$/;
const ACCOUNT_SID = /^AC[0-9A-Fa-f]{32}$/;
const SERVICE_SID = /^MG[0-9A-Fa-f]{32}$/;
const US_E164 = /^\+1[0-9]{10}$/;
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type SmsInboundConfig = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  webhookUrl: string;
  toNumber: string;
  lookupSecret: string;
  encryptionKey: string;
  encryptionKeyId: string;
};

export type SmsContextResult =
  | { status: "duplicate" }
  | { status: "new"; version: number; state: SmsPlanningState };

export type SmsCommitInput = {
  phoneHash: string;
  phoneCiphertext: string;
  providerMessageSid: string;
  bodyDigest: string;
  nextState: SmsPlanningState;
  replyCiphertext: string | null;
  rateLimitedReplyCiphertext: string;
  planningKind: "planning" | "help" | "stopped" | "resumed" | "reset" | "ignored";
  expectedVersion: number;
};

export type SmsCommitResult =
  | { status: "duplicate" }
  | { status: "conflict"; version: number; state: SmsPlanningState }
  | {
      status: "committed" | "rate_limited";
      version: number;
      replyCiphertext: string | null;
    };

export interface SmsStore {
  getContext(phoneHash: string, providerMessageSid: string, bodyDigest: string): Promise<unknown>;
  commit(input: SmsCommitInput): Promise<unknown>;
}

type SmsLogRecord = {
  type: "sms_webhook";
  event:
    | "invalid_signature"
    | "invalid_envelope"
    | "configuration_error"
    | "persistence_error"
    | "state_error"
    | "cas_exhausted";
  cid: string;
  code?: "config" | "signature" | "envelope" | "read" | "commit" | "state" | "cas";
};

export interface SmsInboundDeps {
  loadConfig: () => SmsInboundConfig | null;
  validateTwilio: (
    authToken: string,
    signature: string,
    webhookUrl: string,
    params: TwilioFormParams,
  ) => Promise<boolean>;
  store: SmsStore;
  plan: typeof planSmsMessage;
  log: (record: SmsLogRecord) => void;
}

export function parseSmsInboundConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SmsInboundConfig | null {
  const config: SmsInboundConfig = {
    accountSid: env.TWILIO_ACCOUNT_SID ?? "",
    authToken: env.TWILIO_AUTH_TOKEN ?? "",
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID ?? "",
    webhookUrl: env.TWILIO_SMS_WEBHOOK_URL ?? "",
    toNumber: env.TWILIO_SMS_TO_NUMBER ?? "",
    lookupSecret: env.SMS_LOOKUP_SECRET ?? "",
    encryptionKey: env.SMS_ENCRYPTION_KEY ?? "",
    encryptionKeyId: env.SMS_ENCRYPTION_KEY_ID ?? "current",
  };

  let webhook: URL;
  try {
    webhook = new URL(config.webhookUrl);
  } catch {
    return null;
  }
  if (
    !ACCOUNT_SID.test(config.accountSid) ||
    config.authToken.length < 16 ||
    !SERVICE_SID.test(config.messagingServiceSid) ||
    webhook.protocol !== "https:" ||
    webhook.username ||
    webhook.password ||
    webhook.hash ||
    webhook.search ||
    webhook.pathname !== "/api/sms/inbound" ||
    !US_E164.test(config.toNumber) ||
    config.lookupSecret.length < 32 ||
    !validateSmsEncryptionKey(config.encryptionKey) ||
    !KEY_ID.test(config.encryptionKeyId)
  ) {
    return null;
  }
  return config;
}

async function validateTwilioWithSdk(
  authToken: string,
  signature: string,
  webhookUrl: string,
  params: TwilioFormParams,
): Promise<boolean> {
  const module = await import("twilio");
  const validate =
    module.validateRequest ??
    (module.default as unknown as { validateRequest?: typeof module.validateRequest })
      ?.validateRequest;
  if (!validate) return false;
  return validate(authToken, signature, webhookUrl, params);
}

async function callSmsRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin.rpc as unknown as (
      functionName: string,
      functionArgs: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string | null } | null }>
  )(name, args);
  if (error) throw new Error("sms persistence failed");
  return data;
}

const DEFAULT_STORE: SmsStore = {
  getContext: (phoneHash, providerMessageSid, bodyDigest) =>
    callSmsRpc("get_sms_inbound_context", {
      _phone_hash: phoneHash,
      _provider_message_sid: providerMessageSid,
      _body_digest: bodyDigest,
    }),
  commit: (input) =>
    callSmsRpc("commit_sms_inbound", {
      _phone_hash: input.phoneHash,
      _phone_ciphertext: input.phoneCiphertext,
      _provider_message_sid: input.providerMessageSid,
      _body_digest: input.bodyDigest,
      _next_state: input.nextState,
      _reply_ciphertext: input.replyCiphertext,
      _rate_limited_reply_ciphertext: input.rateLimitedReplyCiphertext,
      _planning_kind: input.planningKind,
      _expected_version: input.expectedVersion,
    }),
};

const DEFAULT_DEPS: SmsInboundDeps = {
  loadConfig: parseSmsInboundConfig,
  validateTwilio: validateTwilioWithSdk,
  store: DEFAULT_STORE,
  plan: planSmsMessage,
  log: (record) => console.warn("[sms]", record),
};

function noStore(status: number, body: string | null = null, contentType?: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (contentType) headers.set("content-type", contentType);
  return new Response(body, { status, headers });
}

function xml(reply: string | null): Response {
  return noStore(200, twimlResponse(reply), "application/xml; charset=utf-8");
}

function correlationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `sms_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FORM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return "";
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    return "";
  }
}

function singleton(form: URLSearchParams, key: string): string | null {
  const values = form.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function parseContext(value: unknown): SmsContextResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.status === "duplicate") return { status: "duplicate" };
  if (
    record.status !== "new" ||
    !Number.isSafeInteger(record.version) ||
    (record.version as number) < 0
  ) {
    return null;
  }
  const state = parseSmsPlanningState(record.state);
  return state ? { status: "new", version: record.version as number, state } : null;
}

function parseCommit(value: unknown): SmsCommitResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.status === "duplicate") return { status: "duplicate" };
  if (
    !Number.isSafeInteger(record.version) ||
    (record.version as number) < 0 ||
    !["conflict", "committed", "rate_limited"].includes(String(record.status))
  ) {
    return null;
  }
  if (record.status === "conflict") {
    const state = parseSmsPlanningState(record.state);
    return state ? { status: "conflict", version: record.version as number, state } : null;
  }
  if (record.replyCiphertext !== null && typeof record.replyCiphertext !== "string") return null;
  return {
    status: record.status as "committed" | "rate_limited",
    version: record.version as number,
    replyCiphertext: record.replyCiphertext as string | null,
  };
}

export function createSmsInboundHandler(
  deps: SmsInboundDeps = DEFAULT_DEPS,
): (request: Request) => Promise<Response> {
  return async function handleSmsInbound(request: Request): Promise<Response> {
    const cid = correlationId();
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") return noStore(415);

    const config = deps.loadConfig();
    if (!config) {
      deps.log({ type: "sms_webhook", event: "configuration_error", cid, code: "config" });
      return noStore(503);
    }

    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) return noStore(413);
    const raw = await readBoundedBody(request);
    if (raw === null) return noStore(413);
    if (!raw) return noStore(400);

    const { params, form } = collectTwilioParams(raw);
    const signature = request.headers.get("x-twilio-signature") ?? "";
    let signatureValid = false;
    try {
      signatureValid = await deps.validateTwilio(
        config.authToken,
        signature,
        config.webhookUrl,
        params,
      );
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      deps.log({ type: "sms_webhook", event: "invalid_signature", cid, code: "signature" });
      return noStore(403);
    }

    const accountSid = singleton(form, "AccountSid");
    const serviceSid = singleton(form, "MessagingServiceSid");
    const messageSid = singleton(form, "MessageSid");
    const rawFrom = singleton(form, "From");
    const rawTo = singleton(form, "To");
    const body = singleton(form, "Body");
    const numMedia = singleton(form, "NumMedia");
    const from = rawFrom ? normalizeE164(rawFrom) : null;
    const to = rawTo ? normalizeE164(rawTo) : null;
    if (
      accountSid !== config.accountSid ||
      serviceSid !== config.messagingServiceSid ||
      to !== config.toNumber
    ) {
      deps.log({ type: "sms_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(403);
    }
    if (
      !messageSid ||
      !MESSAGE_SID.test(messageSid) ||
      !from ||
      !US_E164.test(from) ||
      !to ||
      !US_E164.test(to) ||
      body === null ||
      Array.from(body).length > MAX_MESSAGE_CHARACTERS ||
      numMedia !== "0"
    ) {
      deps.log({ type: "sms_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(400);
    }

    let phoneHash: string;
    let bodyDigest: string;
    let phoneCiphertext: string;
    let rateLimitedReplyCiphertext: string;
    const rateLimitedReply =
      "Confetti is taking a short pause on this thread. Try again in about an hour. Reply STOP to opt out.";
    try {
      phoneHash = await keyedDigestHex(config.lookupSecret, "phone", from);
      bodyDigest = await keyedDigestHex(config.lookupSecret, "body", `${messageSid}:${body}`);
      phoneCiphertext = await encryptSmsValue(
        from,
        config.encryptionKey,
        `phone:${phoneHash}`,
        config.encryptionKeyId,
      );
      rateLimitedReplyCiphertext = await encryptSmsValue(
        rateLimitedReply,
        config.encryptionKey,
        `reply:${phoneHash}:${messageSid}`,
        config.encryptionKeyId,
      );
    } catch {
      deps.log({ type: "sms_webhook", event: "configuration_error", cid, code: "config" });
      return noStore(503);
    }

    let context: SmsContextResult;
    try {
      const parsed = parseContext(await deps.store.getContext(phoneHash, messageSid, bodyDigest));
      if (!parsed) {
        deps.log({ type: "sms_webhook", event: "state_error", cid, code: "state" });
        return noStore(503);
      }
      context = parsed;
    } catch {
      deps.log({ type: "sms_webhook", event: "persistence_error", cid, code: "read" });
      return noStore(503);
    }

    // Twilio may execute TwiML again on a webhook retry. A duplicate therefore
    // returns an empty response even though the original reply intent is kept
    // encrypted for operational recovery.
    if (context.status === "duplicate") return xml(null);

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      let planned: ReturnType<typeof planSmsMessage>;
      try {
        planned = deps.plan(context.state, body);
      } catch {
        deps.log({ type: "sms_webhook", event: "state_error", cid, code: "state" });
        return noStore(503);
      }
      const nextState = parseSmsPlanningState(planned.state);
      if (
        !nextState ||
        (planned.reply !== null && Array.from(planned.reply).length > MAX_REPLY_CHARACTERS)
      ) {
        deps.log({ type: "sms_webhook", event: "state_error", cid, code: "state" });
        return noStore(503);
      }

      let replyCiphertext: string | null = null;
      try {
        if (planned.reply !== null) {
          replyCiphertext = await encryptSmsValue(
            planned.reply,
            config.encryptionKey,
            `reply:${phoneHash}:${messageSid}`,
            config.encryptionKeyId,
          );
        }
      } catch {
        deps.log({ type: "sms_webhook", event: "configuration_error", cid, code: "config" });
        return noStore(503);
      }

      let committed: SmsCommitResult | null;
      try {
        committed = parseCommit(
          await deps.store.commit({
            phoneHash,
            phoneCiphertext,
            providerMessageSid: messageSid,
            bodyDigest,
            nextState,
            replyCiphertext,
            rateLimitedReplyCiphertext,
            planningKind: planned.kind,
            expectedVersion: context.version,
          }),
        );
      } catch {
        deps.log({ type: "sms_webhook", event: "persistence_error", cid, code: "commit" });
        return noStore(503);
      }
      if (!committed) {
        deps.log({ type: "sms_webhook", event: "state_error", cid, code: "state" });
        return noStore(503);
      }
      if (committed.status === "duplicate") return xml(null);
      if (committed.status === "conflict") {
        context = { status: "new", version: committed.version, state: committed.state };
        continue;
      }
      if (committed.replyCiphertext === null) return xml(null);
      if (committed.replyCiphertext === rateLimitedReplyCiphertext) {
        return xml(rateLimitedReply);
      }
      if (committed.replyCiphertext === replyCiphertext) return xml(planned.reply);

      deps.log({ type: "sms_webhook", event: "state_error", cid, code: "state" });
      return noStore(503);
    }

    deps.log({ type: "sms_webhook", event: "cas_exhausted", cid, code: "cas" });
    return noStore(503);
  };
}

const defaultHandler = createSmsInboundHandler();

export const Route = createFileRoute("/api/sms/inbound")({
  server: {
    handlers: {
      POST: ({ request }) => defaultHandler(request),
    },
  },
});
