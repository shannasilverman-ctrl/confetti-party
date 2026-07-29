import { describe, expect, it, vi } from "vitest";
import { getExpectedTwilioSignature, validateRequest } from "twilio";
import {
  createSmsInboundHandler,
  parseSmsInboundConfig,
  type SmsCommitInput,
  type SmsInboundConfig,
  type SmsInboundDeps,
  type SmsStore,
} from "@/routes/api/sms/inbound";
import { planSmsMessage } from "@/lib/sms-planning";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const SERVICE_SID = `MG${"b".repeat(32)}`;
const MESSAGE_SID = `SM${"c".repeat(32)}`;
const FROM = "+12125550123";
const TO = "+16465550123";
const WEBHOOK = "https://sms-staging.confettiplans.com/api/sms/inbound";
const AUTH_TOKEN = "twilio-auth-token-unit-test";
const ENCRYPTION_KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)),
);

const CONFIG: SmsInboundConfig = {
  accountSid: ACCOUNT_SID,
  authToken: AUTH_TOKEN,
  messagingServiceSid: SERVICE_SID,
  webhookUrl: WEBHOOK,
  toNumber: TO,
  lookupSecret: "lookup-secret-with-at-least-thirty-two-characters",
  encryptionKey: ENCRYPTION_KEY,
  encryptionKeyId: "test-key",
};

function validForm(overrides: Record<string, string | null> = {}): URLSearchParams {
  const values: Record<string, string> = {
    AccountSid: ACCOUNT_SID,
    MessagingServiceSid: SERVICE_SID,
    MessageSid: MESSAGE_SID,
    From: FROM,
    To: TO,
    Body: "Bday for a 54 yr old, about 25 people",
    NumMedia: "0",
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
    url = "https://internal-worker.example/api/sms/inbound",
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

function emptyState(status: "active" | "stopped" = "active") {
  return { status, draft: {}, turnCount: 0 } as const;
}

function fakeStore(
  options: {
    context?: unknown | (() => unknown | Promise<unknown>);
    commit?: unknown | ((input: SmsCommitInput) => unknown | Promise<unknown>);
  } = {},
): SmsStore & { commits: SmsCommitInput[]; reads: unknown[][] } {
  const commits: SmsCommitInput[] = [];
  const reads: unknown[][] = [];
  return {
    commits,
    reads,
    async getContext(...args) {
      reads.push(args);
      return typeof options.context === "function"
        ? await options.context()
        : (options.context ?? { status: "new", version: 0, state: emptyState() });
    },
    async commit(input) {
      commits.push(input);
      if (typeof options.commit === "function") return options.commit(input);
      return (
        options.commit ?? {
          status: "committed",
          version: input.expectedVersion + 1,
          replyCiphertext: input.replyCiphertext,
        }
      );
    },
  };
}

function bind(
  store: SmsStore = fakeStore(),
  overrides: Partial<SmsInboundDeps> = {},
): {
  handler: ReturnType<typeof createSmsInboundHandler>;
  logs: unknown[];
  plan: ReturnType<typeof vi.fn<typeof planSmsMessage>>;
} {
  const logs: unknown[] = [];
  const plan = vi.fn(planSmsMessage);
  return {
    logs,
    plan,
    handler: createSmsInboundHandler({
      loadConfig: () => CONFIG,
      validateTwilio: async () => true,
      store,
      plan,
      log: (record) => logs.push(record),
      ...overrides,
    }),
  };
}

async function text(response: Response): Promise<string> {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.text();
}

describe("POST /api/sms/inbound", () => {
  it("accepts only complete, exact, server-side SMS configuration", () => {
    const env = {
      TWILIO_ACCOUNT_SID: ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      TWILIO_MESSAGING_SERVICE_SID: SERVICE_SID,
      TWILIO_SMS_WEBHOOK_URL: WEBHOOK,
      TWILIO_SMS_TO_NUMBER: TO,
      SMS_LOOKUP_SECRET: CONFIG.lookupSecret,
      SMS_ENCRYPTION_KEY: ENCRYPTION_KEY,
      SMS_ENCRYPTION_KEY_ID: "test-key",
    };
    expect(parseSmsInboundConfig(env)).toEqual(CONFIG);
    expect(
      parseSmsInboundConfig({
        ...env,
        TWILIO_SMS_WEBHOOK_URL: "http://insecure.test/api/sms/inbound",
      }),
    ).toBeNull();
    expect(
      parseSmsInboundConfig({ ...env, TWILIO_SMS_WEBHOOK_URL: `${WEBHOOK}?debug=1` }),
    ).toBeNull();
    expect(parseSmsInboundConfig({ ...env, SMS_ENCRYPTION_KEY: btoa("short") })).toBeNull();
    expect(parseSmsInboundConfig({ ...env, SMS_LOOKUP_SECRET: "too-short" })).toBeNull();
  });

  it("accepts form content type with charset and rejects other media types", async () => {
    const { handler } = bind();
    const accepted = await handler(requestFrom());
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("content-type")).toContain("application/xml");

    const rejected = await handler(requestFrom(validForm(), { contentType: "application/json" }));
    expect(rejected.status).toBe(415);
    expect(await text(rejected)).toBe("");
  });

  it("fails closed when staging configuration is absent", async () => {
    const store = fakeStore();
    const { handler, logs } = bind(store, { loadConfig: () => null });
    const response = await handler(requestFrom());

    expect(response.status).toBe(503);
    expect(store.reads).toHaveLength(0);
    expect(logs).toEqual([
      expect.objectContaining({ event: "configuration_error", code: "config" }),
    ]);
  });

  it("bounds both declared and actual form bytes before signature or storage", async () => {
    const validator = vi.fn(async () => true);
    const store = fakeStore();
    const { handler } = bind(store, { validateTwilio: validator });

    const declared = await handler(requestFrom(validForm(), { contentLength: "13000" }));
    expect(declared.status).toBe(413);

    const actual = await handler(
      requestFrom(`Body=${"x".repeat(13_000)}`, { contentLength: undefined }),
    );
    expect(actual.status).toBe(413);
    expect(validator).not.toHaveBeenCalled();
    expect(store.reads).toHaveLength(0);
  });

  it("validates the exact configured URL and every repeated signed parameter", async () => {
    const seen: unknown[] = [];
    const store = fakeStore();
    const form = validForm();
    form.append("Tag", "second");
    form.append("Tag", "first");
    const { handler } = bind(store, {
      validateTwilio: async (_token, _signature, url, params) => {
        seen.push({ url, params });
        return true;
      },
    });
    const response = await handler(
      requestFrom(form, { url: "https://attacker-controlled.invalid/api/sms/inbound" }),
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      {
        url: WEBHOOK,
        params: expect.objectContaining({ Tag: ["second", "first"], Body: expect.any(String) }),
      },
    ]);
  });

  it("accepts a real Twilio SDK signature fixture and rejects a changed body", async () => {
    const form = validForm();
    const params = Object.fromEntries(form.entries());
    const signature = getExpectedTwilioSignature(AUTH_TOKEN, WEBHOOK, params);
    const store = fakeStore();
    const { handler } = bind(store, {
      validateTwilio: async (token, header, url, signedParams) =>
        validateRequest(token, header, url, signedParams),
    });

    expect((await handler(requestFrom(form, { signature }))).status).toBe(200);
    const changed = validForm({ Body: "changed after signing" });
    expect((await handler(requestFrom(changed, { signature }))).status).toBe(403);
  });

  it("rejects an invalid signature before inspecting or storing the envelope", async () => {
    const store = fakeStore();
    const { handler, plan, logs } = bind(store, {
      validateTwilio: async () => false,
    });
    const response = await handler(requestFrom());

    expect(response.status).toBe(403);
    expect(store.reads).toHaveLength(0);
    expect(store.commits).toHaveLength(0);
    expect(plan).not.toHaveBeenCalled();
    expect(logs).toEqual([expect.objectContaining({ event: "invalid_signature" })]);
  });

  it("rejects signed account, service, destination, and parameter-pollution mismatches", async () => {
    for (const form of [
      validForm({ AccountSid: `AC${"d".repeat(32)}` }),
      validForm({ MessagingServiceSid: `MG${"d".repeat(32)}` }),
      validForm({ To: "+16465559999" }),
      (() => {
        const polluted = validForm();
        polluted.append("AccountSid", ACCOUNT_SID);
        return polluted;
      })(),
    ]) {
      const store = fakeStore();
      const { handler } = bind(store);
      const response = await handler(requestFrom(form));
      expect(response.status).toBe(403);
      expect(store.reads).toHaveLength(0);
    }
  });

  it.each([
    ["bad message SID", { MessageSid: "SMbad" }],
    ["non-US sender", { From: "+442071838750" }],
    ["malformed sender", { From: "12125550123" }],
    ["media message", { NumMedia: "1" }],
    ["missing body", { Body: null }],
    ["oversized message", { Body: "x".repeat(1601) }],
  ])("rejects a signed malformed envelope: %s", async (_label, overrides) => {
    const store = fakeStore();
    const { handler } = bind(store);
    const response = await handler(requestFrom(validForm(overrides)));
    expect(response.status).toBe(400);
    expect(store.reads).toHaveLength(0);
  });

  it("creates an adult-aware deterministic reply without persisting raw phone or body", async () => {
    const store = fakeStore();
    const { handler } = bind(store);
    const response = await handler(requestFrom());
    const xmlBody = await text(response);

    expect(response.status).toBe(200);
    expect(xmlBody).toContain("54th Birthday");
    expect(xmlBody).toContain("What date");
    expect(xmlBody).not.toContain("play venue");
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].nextState).toMatchObject({
      status: "active",
      draft: {
        identity: { occasion: "birthday", honoreeAge: 54 },
        people: { expectedCount: 25 },
      },
    });
    const persisted = JSON.stringify(store.commits[0]);
    expect(persisted).not.toContain(FROM);
    expect(persisted).not.toContain("Bday for a 54 yr old");
    expect(store.commits[0].phoneHash).toMatch(/^[0-9a-f]{64}$/);
    expect(store.commits[0].bodyDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(store.commits[0].phoneCiphertext).toMatch(/^v1\.test-key\./);
  });

  it("returns empty TwiML for sequential or commit-race duplicates", async () => {
    const fromRead = fakeStore({ context: { status: "duplicate" } });
    const first = bind(fromRead);
    const firstResponse = await first.handler(requestFrom());
    expect(await text(firstResponse)).toContain("<Response></Response>");
    expect(first.plan).not.toHaveBeenCalled();
    expect(fromRead.commits).toHaveLength(0);

    const fromCommit = fakeStore({ commit: { status: "duplicate" } });
    const second = bind(fromCommit);
    const secondResponse = await second.handler(requestFrom());
    expect(await text(secondResponse)).toContain("<Response></Response>");
    expect(fromCommit.commits).toHaveLength(1);
  });

  it("keeps ordinary messages silent while stopped but still answers HELP", async () => {
    const ignoredStore = fakeStore({
      context: { status: "new", version: 4, state: emptyState("stopped") },
    });
    const ignored = bind(ignoredStore);
    const ignoredResponse = await ignored.handler(requestFrom(validForm({ Body: "August 15" })));
    expect(await text(ignoredResponse)).toContain("<Response></Response>");
    expect(ignoredStore.commits[0]).toMatchObject({
      planningKind: "ignored",
      nextState: { status: "stopped" },
    });

    const helpStore = fakeStore({
      context: { status: "new", version: 5, state: emptyState("stopped") },
    });
    const help = bind(helpStore);
    const helpResponse = await help.handler(requestFrom(validForm({ Body: "HELP" })));
    expect(await text(helpResponse)).toContain("Confetti helps");
    expect(helpStore.commits[0]).toMatchObject({
      planningKind: "help",
      nextState: { status: "stopped" },
    });
  });

  it("returns the database-selected first rate-limit notice and then silence", async () => {
    const noticeStore = fakeStore({
      commit: (input: SmsCommitInput) => ({
        status: "rate_limited",
        version: 9,
        replyCiphertext: input.rateLimitedReplyCiphertext,
      }),
    });
    const notice = bind(noticeStore);
    expect(await text(await notice.handler(requestFrom()))).toContain("short pause");

    const silentStore = fakeStore({
      commit: { status: "rate_limited", version: 10, replyCiphertext: null },
    });
    const silent = bind(silentStore);
    expect(await text(await silent.handler(requestFrom()))).toContain("<Response></Response>");
  });

  it("replans after a CAS conflict and stops after three conflicts", async () => {
    let calls = 0;
    const recoveredStore = fakeStore({
      commit: (input: SmsCommitInput) => {
        calls += 1;
        if (calls === 1) {
          return { status: "conflict", version: 1, state: emptyState() };
        }
        return {
          status: "committed",
          version: 2,
          replyCiphertext: input.replyCiphertext,
        };
      },
    });
    const recovered = bind(recoveredStore);
    expect((await recovered.handler(requestFrom())).status).toBe(200);
    expect(recoveredStore.commits).toHaveLength(2);
    expect(recoveredStore.commits.map((entry) => entry.expectedVersion)).toEqual([0, 1]);

    const conflictedStore = fakeStore({
      commit: (_input: SmsCommitInput) => ({
        status: "conflict",
        version: conflictedStore.commits.length,
        state: emptyState(),
      }),
    });
    const conflicted = bind(conflictedStore);
    const response = await conflicted.handler(requestFrom());
    expect(response.status).toBe(503);
    expect(conflictedStore.commits).toHaveLength(3);
    expect(conflicted.logs).toEqual([expect.objectContaining({ event: "cas_exhausted" })]);
  });

  it("logs only fixed categories and a random correlation id on persistence failure", async () => {
    const secretBody = "private party at 123 Main Street";
    const store = fakeStore({
      context: () => {
        throw new Error(`database leaked ${FROM} ${secretBody} ${MESSAGE_SID}`);
      },
    });
    const { handler, logs } = bind(store);
    const response = await handler(requestFrom(validForm({ Body: secretBody })));
    expect(response.status).toBe(503);

    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      FROM,
      secretBody,
      MESSAGE_SID,
      AUTH_TOKEN,
      ACCOUNT_SID,
      SERVICE_SID,
      "database leaked",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(logs).toEqual([
      expect.objectContaining({
        type: "sms_webhook",
        event: "persistence_error",
        code: "read",
        cid: expect.stringMatching(/^sms_[0-9a-f]{24}$/),
      }),
    ]);
  });
});
