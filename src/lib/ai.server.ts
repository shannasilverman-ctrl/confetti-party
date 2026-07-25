// Server-only Lovable AI Gateway wrapper. Do NOT import from client code.
// If LOVABLE_API_KEY is absent the brain falls back to a deterministic demo.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function hasAiKey(): boolean {
  return !!process.env.LOVABLE_API_KEY;
}

export async function chatJSON<T = unknown>(opts: {
  system: string;
  messages: ChatMessage[];
  schemaHint: string;
  model?: string;
  temperature?: number;
}): Promise<{ replyText: string; parsed: T | null; raw: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not set");

  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.6,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content: `${opts.system}\n\nRespond ONLY with valid JSON. Shape:\n${opts.schemaHint}`,
      },
      ...opts.messages,
    ],
  };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${t.slice(0, 200)}`);
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
