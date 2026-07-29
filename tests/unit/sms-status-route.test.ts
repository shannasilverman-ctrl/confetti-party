import { describe, expect, it, vi } from "vitest";
import { getExpectedTwilioSignature, validateRequest } from "twilio";
import {
  createSmsStatusHandler,
  parseSmsStatusConfig,
  type SmsDeliveryInput,
  type SmsDeliveryStore,
  type SmsStatusConfig,
  type SmsStatusDeps,
} from "@/routes/api/sms/status";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const SERVICE_SID = `MG${"f".repeat(32)}`;
const MESSAGE_SID = `SM${"b".repeat(32)}`;
const FROM = "+16465550123";
const TO = "+12125550123";
const RECEIPT = "c".repeat(64);
const WEBHOOK = "https://sms-staging.confettiplans.com/api/sms/status";
const SIGNED_WEBHOOK = `${WEBHOOK}?receipt=${RECEIPT}`;
const AUTH_TOKEN = "twilio-auth-token-unit-test";
const LOOKUP_KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 33)),
);

const CONFIG: SmsStatusConfig = {
  accountSid: ACCOUNT_SID,
  authToken: AUTH_TOKEN,
  messagingServiceSid: SERVICE_SID,
  webhookUrl: WEBHOOK,
  fromNumber: FROM,
  lookupSecret: LOOKUP_KEY,
};

function validForm(overrides: Record<string, string | null> = {}): URLSearchParams {
  const values: Record<string, string> = {
    AccountSid: ACCOUNT_SID,
    MessagingServiceSid: SERVICE_SID,
    MessageSid: MESSAGE_SID,
    SmsSid: MESSAGE_SID,
    MessageStatus: "delivered",
    SmsStatus: "delivered",
    ErrorCode: "",
    From: FROM,
    To: TO,
  };
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...values, ...overrides })) {
    if (value !== null) form.set(key, value);
  }
  return form;
}

function requestFrom(
  form: URLSearchParams | string = validForm(),
  {
    contentType = "application/x-www-form-urlencoded; charset=UTF-8",
    signature = "signed",
    contentLength,
    url = `https://internal-worker.example/api/sms/status?receipt=${RECEIPT}`,
  }: {
    contentType?: string;
    signature?: string;
    contentLength?: string;
    url?: string;
  } = {},
): Request {
  const body = typeof form === "string" ? form : form.toString();
  const headers: Record<string, string> = {
    "content-type": contentType,
    "x-twilio-signature": signature,
  };
  if (contentLength) headers["content-length"] = contentLength;
  return new Request(url, { method: "POST", headers, body });
}

function fakeStore(
  result: unknown | ((input: SmsDeliveryInput) => unknown | Promise<unknown>) = {
    status: "recorded",
  },
): SmsDeliveryStore & { records: SmsDeliveryInput[] } {
  const records: SmsDeliveryInput[] = [];
  return {
    records,
    async record(input) {
      records.push(input);
      return typeof result === "function" ? await result(input) : result;
    },
  };
}

function bind(
  store: SmsDeliveryStore = fakeStore(),
  overrides: Partial<SmsStatusDeps> = {},
): {
  handler: ReturnType<typeof createSmsStatusHandler>;
  logs: unknown[];
} {
  const logs: unknown[] = [];
  return {
    logs,
    handler: createSmsStatusHandler({
      loadConfig: () => CONFIG,
      validateTwilio: async () => true,
      store,
      log: (record) => logs.push(record),
      ...overrides,
    }),
  };
}

async function body(response: Response): Promise<string> {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.text();
}

describe("POST /api/sms/status", () => {
  it("accepts only an exact HTTPS status callback configuration", () => {
    const env = {
      TWILIO_ACCOUNT_SID: ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      TWILIO_MESSAGING_SERVICE_SID: SERVICE_SID,
      TWILIO_SMS_WEBHOOK_URL: "https://sms-staging.confettiplans.com/api/sms/inbound",
      TWILIO_SMS_STATUS_WEBHOOK_URL: WEBHOOK,
      TWILIO_SMS_TO_NUMBER: FROM,
      SMS_LOOKUP_SECRET: LOOKUP_KEY,
    };
    expect(parseSmsStatusConfig(env)).toEqual(CONFIG);
    expect(
      parseSmsStatusConfig({
        ...env,
        TWILIO_SMS_STATUS_WEBHOOK_URL: "http://insecure.test/api/sms/status",
      }),
    ).toBeNull();
    expect(
      parseSmsStatusConfig({
        ...env,
        TWILIO_SMS_STATUS_WEBHOOK_URL: `${WEBHOOK}?receipt=${RECEIPT}`,
      }),
    ).toBeNull();
    expect(parseSmsStatusConfig({ ...env, TWILIO_AUTH_TOKEN: "short" })).toBeNull();
    expect(
      parseSmsStatusConfig({
        ...env,
        TWILIO_SMS_STATUS_WEBHOOK_URL: "https://other.example/api/sms/status",
      }),
    ).toBeNull();
    expect(
      parseSmsStatusConfig({
        ...env,
        TWILIO_SMS_WEBHOOK_URL: "https://sms_stage.confettiplans.com/api/sms/inbound",
        TWILIO_SMS_STATUS_WEBHOOK_URL: "https://sms_stage.confettiplans.com/api/sms/status",
      }),
    ).toBeNull();
  });

  it("fails closed when configuration is absent", async () => {
    const store = fakeStore();
    const { handler, logs } = bind(store, { loadConfig: () => null });
    const response = await handler(requestFrom());

    expect(response.status).toBe(503);
    expect(store.records).toHaveLength(0);
    expect(logs).toEqual([
      expect.objectContaining({ event: "configuration_error", code: "config" }),
    ]);
  });

  it("rejects wrong media types and bounds declared and streamed form bytes", async () => {
    const validator = vi.fn(async () => true);
    const store = fakeStore();
    const { handler } = bind(store, { validateTwilio: validator });

    expect(
      (await handler(requestFrom(validForm(), { contentType: "application/json" }))).status,
    ).toBe(415);
    expect((await handler(requestFrom(validForm(), { contentLength: "13000" }))).status).toBe(413);
    expect((await handler(requestFrom(`Status=${"x".repeat(13_000)}`))).status).toBe(413);
    expect(validator).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(0);
  });

  it("returns 503 for body-stream failures and 400 for malformed UTF-8", async () => {
    const validator = vi.fn(async () => true);
    const store = fakeStore();
    const { handler, logs } = bind(store, { validateTwilio: validator });
    const failedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("socket failed with private details"));
      },
    });
    const failedRequest = new Request(
      `https://internal-worker.example/api/sms/status?receipt=${RECEIPT}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": "signed",
        },
        body: failedStream,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    expect((await handler(failedRequest)).status).toBe(503);
    expect(logs).toEqual([expect.objectContaining({ event: "persistence_error", code: "read" })]);
    expect(JSON.stringify(logs)).not.toContain("private details");

    const invalidRequest = new Request(
      `https://internal-worker.example/api/sms/status?receipt=${RECEIPT}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": "signed",
        },
        body: new Uint8Array([0xff]),
      },
    );
    expect((await handler(invalidRequest)).status).toBe(400);
    expect(validator).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(0);
  });

  it("requires one bounded receipt query and rejects query pollution before storage", async () => {
    const store = fakeStore();
    const validator = vi.fn(async () => true);
    const { handler } = bind(store, { validateTwilio: validator });

    for (const url of [
      "https://internal-worker.example/api/sms/status",
      "https://internal-worker.example/api/sms/status?receipt=short",
      `https://internal-worker.example/api/sms/status?receipt=${RECEIPT}&debug=1`,
      `https://internal-worker.example/api/sms/status?receipt=${RECEIPT}&receipt=${RECEIPT}`,
    ]) {
      expect((await handler(requestFrom(validForm(), { url }))).status).toBe(400);
    }
    expect(validator).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(0);
  });

  it("validates every signed parameter against the exact configured URL plus receipt", async () => {
    const seen: unknown[] = [];
    const form = validForm();
    form.append("FutureField", "one");
    form.append("FutureField", "two");
    const { handler } = bind(fakeStore(), {
      validateTwilio: async (_token, _signature, url, params) => {
        seen.push({ url, params });
        return true;
      },
    });
    const response = await handler(
      requestFrom(form, {
        url: `https://attacker-controlled.invalid/api/sms/status?receipt=${RECEIPT}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      {
        url: SIGNED_WEBHOOK,
        params: expect.objectContaining({ FutureField: ["one", "two"] }),
      },
    ]);
  });

  it("accepts an official SDK signature fixture and rejects a changed status", async () => {
    const form = validForm();
    form.append("FutureField", "z");
    form.append("FutureField", "a");
    const params = {
      ...Object.fromEntries(form.entries()),
      FutureField: ["z", "a"],
    };
    const signature = getExpectedTwilioSignature(AUTH_TOKEN, SIGNED_WEBHOOK, params);
    const store = fakeStore();
    const { handler } = bind(store, {
      validateTwilio: async (token, header, url, signedParams) =>
        validateRequest(token, header, url, signedParams),
    });

    expect((await handler(requestFrom(form, { signature }))).status).toBe(200);
    expect(
      (
        await handler(
          requestFrom(validForm({ MessageStatus: "failed", SmsStatus: "failed" }), {
            signature,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          requestFrom(form, {
            signature,
            url: `https://internal-worker.example/api/sms/status?receipt=${"d".repeat(64)}`,
          }),
        )
      ).status,
    ).toBe(403);
    expect(store.records).toHaveLength(1);
  });

  it("accepts callbacks when optional legacy SMS aliases and ErrorCode are absent", async () => {
    const store = fakeStore();
    const { handler } = bind(store);
    const response = await handler(
      requestFrom(
        validForm({
          SmsSid: null,
          SmsStatus: null,
          ErrorCode: null,
          From: null,
          To: null,
          MessagingServiceSid: null,
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(store.records).toEqual([
      expect.objectContaining({
        providerMessageSid: MESSAGE_SID,
        messageStatus: "delivered",
        errorCode: null,
        recipientPhoneHash: null,
      }),
    ]);
  });

  it("rejects invalid signatures before envelope inspection or storage", async () => {
    const store = fakeStore();
    const { handler, logs } = bind(store, { validateTwilio: async () => false });
    const response = await handler(requestFrom());

    expect(response.status).toBe(403);
    expect(store.records).toHaveLength(0);
    expect(logs).toEqual([expect.objectContaining({ event: "invalid_signature" })]);
  });

  it("returns 503 when signature validation infrastructure throws", async () => {
    const store = fakeStore();
    const { handler, logs } = bind(store, {
      validateTwilio: async () => {
        throw new Error("SDK unavailable with private details");
      },
    });
    const response = await handler(requestFrom());

    expect(response.status).toBe(503);
    expect(store.records).toHaveLength(0);
    expect(logs).toEqual([
      expect.objectContaining({ event: "configuration_error", code: "signature" }),
    ]);
    expect(JSON.stringify(logs)).not.toContain("private details");
  });

  it("rejects signed account mismatches, polluted fields, malformed SIDs and statuses", async () => {
    const polluted = validForm();
    polluted.append("MessageStatus", "sent");
    const pollutedError = validForm();
    pollutedError.append("ErrorCode", "");
    const cases = [
      { form: validForm({ AccountSid: `AC${"d".repeat(32)}` }), status: 403 },
      { form: polluted, status: 400 },
      { form: pollutedError, status: 400 },
      { form: validForm({ MessageSid: "SMbad", SmsSid: "SMbad" }), status: 400 },
      { form: validForm({ SmsSid: `SM${"e".repeat(32)}` }), status: 400 },
      { form: validForm({ From: "+16465559999" }), status: 403 },
      { form: validForm({ MessagingServiceSid: `MG${"e".repeat(32)}` }), status: 403 },
      { form: validForm({ To: "+442071838750" }), status: 400 },
      { form: validForm({ MessageStatus: "invented", SmsStatus: "invented" }), status: 400 },
      { form: validForm({ ErrorCode: "private error text" }), status: 400 },
      { form: validForm({ ErrorCode: "30003" }), status: 400 },
    ];
    for (const item of cases) {
      const store = fakeStore();
      const { handler } = bind(store);
      expect((await handler(requestFrom(item.form))).status).toBe(item.status);
      expect(store.records).toHaveLength(0);
    }
  });

  it("records only bounded delivery metadata and acknowledges action callbacks with empty TwiML", async () => {
    const store = fakeStore();
    const { handler, logs } = bind(store);
    const response = await handler(
      requestFrom(
        validForm({
          MessageStatus: "undelivered",
          SmsStatus: "undelivered",
          ErrorCode: "30003",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(await body(response)).toContain("<Response></Response>");
    expect(store.records).toEqual([
      {
        receiptToken: RECEIPT,
        providerMessageSid: MESSAGE_SID,
        messageStatus: "undelivered",
        errorCode: "30003",
        recipientPhoneHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ]);
    expect(logs).toEqual([]);
  });

  it.each(["enriched", "duplicate", "out_of_order"] as const)(
    "acknowledges an idempotent %s database result without logging sensitive metadata",
    async (status) => {
      const { handler, logs } = bind(fakeStore({ status }));
      expect((await handler(requestFrom())).status).toBe(200);
      expect(logs).toEqual([]);
    },
  );

  it("contains permanent provider conflicts and acknowledges them without retrying", async () => {
    const { handler, logs } = bind(fakeStore({ status: "conflict" }));
    expect((await handler(requestFrom())).status).toBe(200);
    expect(logs).toEqual([
      expect.objectContaining({ event: "provider_conflict", code: "conflict" }),
    ]);
    expect(JSON.stringify(logs)).not.toContain(RECEIPT);
    expect(JSON.stringify(logs)).not.toContain(MESSAGE_SID);
  });

  it("contains unknown receipt tokens without exposing the token or SID in logs", async () => {
    const { handler, logs } = bind(fakeStore({ status: "unknown" }));
    expect((await handler(requestFrom())).status).toBe(200);
    const serialized = JSON.stringify(logs);
    expect(logs).toEqual([expect.objectContaining({ event: "unknown_receipt", code: "unknown" })]);
    expect(serialized).not.toContain(RECEIPT);
    expect(serialized).not.toContain(MESSAGE_SID);
  });

  it("returns retryable failures for persistence and invalid database results", async () => {
    const failed = bind(
      fakeStore(async () => {
        throw new Error("database contained private metadata");
      }),
    );
    expect((await failed.handler(requestFrom())).status).toBe(503);
    expect(JSON.stringify(failed.logs)).not.toContain("private metadata");

    const malformed = bind(fakeStore({ status: "surprise" }));
    expect((await malformed.handler(requestFrom())).status).toBe(503);
    expect(malformed.logs).toEqual([expect.objectContaining({ event: "state_error" })]);
  });
});
