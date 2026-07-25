import { afterEach, describe, expect, it, vi } from "vitest";
import { chatJSON, hasAiKey } from "@/lib/ai.server";

const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_TEXT_MODEL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_TEXT_MODEL;
  else process.env.OPENAI_TEXT_MODEL = originalModel;
});

describe("first-party text AI client", () => {
  it("reports unavailable when no server key is configured", () => {
    delete process.env.OPENAI_API_KEY;
    expect(hasAiKey()).toBe(false);
  });

  it("calls OpenAI directly with a server-only key and parses the JSON reply", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_TEXT_MODEL = "test-model";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"reply":"Let’s make it lovely.","draftPatch":{}}' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJSON<{ reply: string }>({
      system: "You are a calm co-host.",
      messages: [{ role: "user", content: "Plan a dinner." }],
      schemaHint: '{"reply": "string"}',
    });

    expect(result.replyText).toBe("Let’s make it lovely.");
    expect(result.parsed).toEqual({ reply: "Let’s make it lovely.", draftPatch: {} });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-model",
      response_format: { type: "json_object" },
    });
  });

  it("does not include upstream response bodies beyond the bounded error excerpt", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("x".repeat(500), { status: 429 })),
    );

    await expect(
      chatJSON({
        system: "system",
        messages: [{ role: "user", content: "hello" }],
        schemaHint: "{}",
      }),
    ).rejects.toThrow(/^OpenAI 429: x{200}$/);
  });
});
