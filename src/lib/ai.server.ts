// Server-only, first-party OpenAI wrapper. Do NOT import from client code.
// If OPENAI_API_KEY is absent the brain falls back to a deterministic demo.

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5.6-terra";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function hasAiKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function chatJSON<T = unknown>(opts: {
  system: string;
  messages: ChatMessage[];
  schemaHint: string;
  model?: string;
  temperature?: number;
}): Promise<{ replyText: string; parsed: T | null; raw: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const model = opts.model ?? process.env.OPENAI_TEXT_MODEL ?? DEFAULT_MODEL;

  const body = {
    model,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content: `${opts.system}\n\nRespond ONLY with valid JSON. Shape:\n${opts.schemaHint}`,
      },
      ...opts.messages,
    ],
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  let parsed: T | null = null;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    parsed = null;
  }
  const maybeReply =
    parsed && typeof (parsed as unknown as { reply?: unknown }).reply === "string"
      ? String((parsed as unknown as { reply: string }).reply)
      : raw;
  return { replyText: maybeReply, parsed, raw };
}
