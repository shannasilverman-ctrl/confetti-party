import { createFileRoute } from "@tanstack/react-router";
import {
  collectTwilioParams,
  keyedDigestHex,
  normalizeE164,
  readBoundedUtf8Body,
  twimlResponse,
  validateSmsHmacKey,
  type TwilioFormParams,
} from "@/lib/sms-transport";

const MAX_FORM_BYTES = 12 * 1024;
const ACCOUNT_SID = /^AC[0-9A-Fa-f]{32}$/;
const SERVICE_SID = /^MG[0-9A-Fa-f]{32}$/;
const MESSAGE_SID = /^SM[0-9A-Fa-f]{32}$/;
const US_E164 = /^\+1[0-9]{10}$/;
const RECEIPT_TOKEN = /^[0-9a-f]{64}$/;
const ERROR_CODE = /^[0-9]{1,10}$/;
const DELIVERY_STATUSES = new Set([
  "queued",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "invalid",
]);

export type SmsStatusConfig = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  webhookUrl: string;
  fromNumber: string;
  lookupSecret: string;
};

export type SmsDeliveryInput = {
  receiptToken: string;
  providerMessageSid: string;
  messageStatus: string;
  errorCode: string | null;
  recipientPhoneHash: string | null;
};

export type SmsDeliveryResult = {
  status: "recorded" | "enriched" | "duplicate" | "out_of_order" | "conflict" | "unknown";
};

export interface SmsDeliveryStore {
  record(input: SmsDeliveryInput): Promise<unknown>;
}

type SmsStatusLogRecord = {
  type: "sms_status_webhook";
  event:
    | "invalid_signature"
    | "invalid_envelope"
    | "configuration_error"
    | "persistence_error"
    | "provider_conflict"
    | "unknown_receipt"
    | "state_error";
  cid: string;
  code?: "config" | "signature" | "envelope" | "read" | "commit" | "state" | "conflict" | "unknown";
};

export interface SmsStatusDeps {
  loadConfig: () => SmsStatusConfig | null;
  validateTwilio: (
    authToken: string,
    signature: string,
    webhookUrl: string,
    params: TwilioFormParams,
  ) => Promise<boolean>;
  store: SmsDeliveryStore;
  log: (record: SmsStatusLogRecord) => void;
}

export function parseSmsStatusConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SmsStatusConfig | null {
  const config: SmsStatusConfig = {
    accountSid: env.TWILIO_ACCOUNT_SID ?? "",
    authToken: env.TWILIO_AUTH_TOKEN ?? "",
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID ?? "",
    webhookUrl: env.TWILIO_SMS_STATUS_WEBHOOK_URL ?? "",
    fromNumber: env.TWILIO_SMS_TO_NUMBER ?? "",
    lookupSecret: env.SMS_LOOKUP_SECRET ?? "",
  };
  let webhook: URL;
  let inboundWebhook: URL;
  try {
    webhook = new URL(config.webhookUrl);
    inboundWebhook = new URL(env.TWILIO_SMS_WEBHOOK_URL ?? "");
  } catch {
    return null;
  }
  if (
    !ACCOUNT_SID.test(config.accountSid) ||
    config.authToken.length < 16 ||
    !SERVICE_SID.test(config.messagingServiceSid) ||
    !US_E164.test(config.fromNumber) ||
    !validateSmsHmacKey(config.lookupSecret) ||
    webhook.protocol !== "https:" ||
    webhook.username ||
    webhook.password ||
    webhook.hash ||
    webhook.search ||
    webhook.pathname !== "/api/sms/status" ||
    inboundWebhook.protocol !== "https:" ||
    inboundWebhook.username ||
    inboundWebhook.password ||
    inboundWebhook.hash ||
    inboundWebhook.search ||
    inboundWebhook.pathname !== "/api/sms/inbound" ||
    inboundWebhook.origin !== webhook.origin ||
    !isTwilioHostname(webhook.hostname)
  ) {
    return null;
  }
  return config;
}

function isTwilioHostname(hostname: string): boolean {
  return (
    hostname.length <= 253 &&
    !hostname.includes("_") &&
    hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
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

async function callSmsStatusRpc(input: SmsDeliveryInput): Promise<unknown> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin.rpc as unknown as (
      functionName: string,
      functionArgs: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string | null } | null }>
  )("record_sms_delivery_status", {
    _receipt_token: input.receiptToken,
    _provider_message_sid: input.providerMessageSid,
    _message_status: input.messageStatus,
    _error_code: input.errorCode,
    _recipient_phone_hash: input.recipientPhoneHash,
  });
  if (error) throw new Error("sms delivery persistence failed");
  return data;
}

const DEFAULT_DEPS: SmsStatusDeps = {
  loadConfig: parseSmsStatusConfig,
  validateTwilio: validateTwilioWithSdk,
  store: { record: callSmsStatusRpc },
  log: (record) => console.warn("[sms-status]", record),
};

function noStore(status: number, body: string | null = null, contentType?: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (contentType) headers.set("content-type", contentType);
  return new Response(body, { status, headers });
}

function acknowledged(): Response {
  return noStore(200, twimlResponse(null), "application/xml; charset=utf-8");
}

function correlationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `sms_status_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function singleton(form: URLSearchParams, key: string): string | null {
  const values = form.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function parseDeliveryResult(value: unknown): SmsDeliveryResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).status;
  return ["recorded", "enriched", "duplicate", "out_of_order", "conflict", "unknown"].includes(
    String(status),
  )
    ? { status: status as SmsDeliveryResult["status"] }
    : null;
}

export function createSmsStatusHandler(
  deps: SmsStatusDeps = DEFAULT_DEPS,
): (request: Request) => Promise<Response> {
  return async function handleSmsStatus(request: Request): Promise<Response> {
    const cid = correlationId();
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") return noStore(415);

    const config = deps.loadConfig();
    if (!config) {
      deps.log({ type: "sms_status_webhook", event: "configuration_error", cid, code: "config" });
      return noStore(503);
    }

    const requestUrl = new URL(request.url);
    const receiptValues = requestUrl.searchParams.getAll("receipt");
    if (
      receiptValues.length !== 1 ||
      !RECEIPT_TOKEN.test(receiptValues[0]) ||
      Array.from(requestUrl.searchParams.keys()).some((key) => key !== "receipt")
    ) {
      deps.log({ type: "sms_status_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(400);
    }
    const signedUrl = new URL(config.webhookUrl);
    signedUrl.searchParams.set("receipt", receiptValues[0]);

    const bodyResult = await readBoundedUtf8Body(request, MAX_FORM_BYTES);
    if (bodyResult.status === "too_large") return noStore(413);
    if (bodyResult.status === "read_error") {
      deps.log({ type: "sms_status_webhook", event: "persistence_error", cid, code: "read" });
      return noStore(503);
    }
    if (bodyResult.status !== "ok") return noStore(400);
    if (!bodyResult.body) return noStore(400);
    const raw = bodyResult.body;

    const { params, form } = collectTwilioParams(raw);
    const signature = request.headers.get("x-twilio-signature") ?? "";
    let signatureValid = false;
    try {
      signatureValid = await deps.validateTwilio(
        config.authToken,
        signature,
        signedUrl.toString(),
        params,
      );
    } catch {
      deps.log({
        type: "sms_status_webhook",
        event: "configuration_error",
        cid,
        code: "signature",
      });
      return noStore(503);
    }
    if (!signatureValid) {
      deps.log({ type: "sms_status_webhook", event: "invalid_signature", cid, code: "signature" });
      return noStore(403);
    }

    const accountSid = singleton(form, "AccountSid");
    const messageSid = singleton(form, "MessageSid");
    const smsSid = form.has("SmsSid") ? singleton(form, "SmsSid") : messageSid;
    const messageStatus = singleton(form, "MessageStatus");
    const smsStatus = form.has("SmsStatus") ? singleton(form, "SmsStatus") : messageStatus;
    const rawErrorCode = form.has("ErrorCode") ? singleton(form, "ErrorCode") : "";
    const errorCode = rawErrorCode === "" ? null : rawErrorCode;
    const rawFrom = form.has("From") ? singleton(form, "From") : "";
    const rawTo = form.has("To") ? singleton(form, "To") : "";
    const serviceSid = form.has("MessagingServiceSid")
      ? singleton(form, "MessagingServiceSid")
      : "";
    const from = rawFrom ? normalizeE164(rawFrom) : null;
    const to = rawTo ? normalizeE164(rawTo) : null;

    if (accountSid !== config.accountSid) {
      deps.log({ type: "sms_status_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(403);
    }
    if (
      !messageSid ||
      !MESSAGE_SID.test(messageSid) ||
      smsSid !== messageSid ||
      !messageStatus ||
      !DELIVERY_STATUSES.has(messageStatus) ||
      smsStatus !== messageStatus ||
      rawErrorCode === null ||
      (errorCode !== null &&
        (!ERROR_CODE.test(errorCode) ||
          !["failed", "undelivered", "invalid"].includes(messageStatus)))
    ) {
      deps.log({ type: "sms_status_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(400);
    }
    if (
      rawFrom === null ||
      rawTo === null ||
      serviceSid === null ||
      (rawFrom !== "" && from !== config.fromNumber) ||
      (serviceSid !== "" && serviceSid !== config.messagingServiceSid)
    ) {
      deps.log({ type: "sms_status_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(403);
    }
    if (rawTo !== "" && (!to || !US_E164.test(to))) {
      deps.log({ type: "sms_status_webhook", event: "invalid_envelope", cid, code: "envelope" });
      return noStore(400);
    }

    let recipientPhoneHash: string | null = null;
    if (to) {
      try {
        recipientPhoneHash = await keyedDigestHex(config.lookupSecret, "phone", to);
      } catch {
        deps.log({ type: "sms_status_webhook", event: "configuration_error", cid, code: "config" });
        return noStore(503);
      }
    }

    let result: SmsDeliveryResult | null;
    try {
      result = parseDeliveryResult(
        await deps.store.record({
          receiptToken: receiptValues[0],
          providerMessageSid: messageSid,
          messageStatus,
          errorCode,
          recipientPhoneHash,
        }),
      );
    } catch {
      deps.log({ type: "sms_status_webhook", event: "persistence_error", cid, code: "commit" });
      return noStore(503);
    }
    if (!result) {
      deps.log({ type: "sms_status_webhook", event: "state_error", cid, code: "state" });
      return noStore(503);
    }
    if (result.status === "unknown") {
      deps.log({ type: "sms_status_webhook", event: "unknown_receipt", cid, code: "unknown" });
    }
    if (result.status === "conflict") {
      deps.log({
        type: "sms_status_webhook",
        event: "provider_conflict",
        cid,
        code: "conflict",
      });
    }
    return acknowledged();
  };
}

const defaultHandler = createSmsStatusHandler();

export const Route = createFileRoute("/api/sms/status")({
  server: {
    handlers: {
      POST: ({ request }) => defaultHandler(request),
    },
  },
});
