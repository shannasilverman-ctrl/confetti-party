import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRealtimeDepsForTests,
  __setRealtimeDepsForTests,
  handleMintRealtimeSession,
} from "@/routes/api/realtime/session";

// ---- Supabase mock ---------------------------------------------------------

interface FakeSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
}

interface FakeSupabaseState {
  user: { id: string } | null;
  authError?: boolean;
  sessions: FakeSession[];
  selectError?: { code: string } | null;
  insertError?: { code: string } | null;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
}

function makeFakeSupabase(state: FakeSupabaseState) {
  return {
    auth: {
      getUser: async () => {
        if (state.authError || !state.user) {
          return { data: { user: null }, error: { message: "no user" } };
        }
        return { data: { user: state.user }, error: null };
      },
    },
    from(table: string) {
      if (table !== "talk_sessions") throw new Error(`unexpected table ${table}`);
      const api = {
        _rows: null as FakeSession[] | null,
        select() {
          this._rows = state.sessions;
          return this;
        },
        eq(_col: string, _val: string) {
          return this;
        },
        gte(_col: string, _iso: string) {
          return this;
        },
        // Terminal for the rate-lookup path:
        then(resolve: (v: unknown) => unknown) {
          if (state.selectError) return resolve({ data: null, error: state.selectError });
          return resolve({ data: state.sessions, error: null });
        },
        // Insert path:
        insert(row: Record<string, unknown>) {
          if (state.insertError) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: state.insertError }),
              }),
            };
          }
          const newRow: FakeSession = {
            id: `sess_${state.sessions.length + 1}`,
            user_id: (row.user_id as string) ?? "u",
            started_at: new Date().toISOString(),
            ended_at: null,
          };
          state.sessions.push(newRow);
          return {
            select: () => ({
              single: async () => ({ data: { id: newRow.id }, error: null }),
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async (_c: string, id: string) => {
              state.updates.push({ id, patch });
              return { data: null, error: null };
            },
          };
        },
      };
      return api;
    },
  } as unknown as Parameters<typeof __setRealtimeDepsForTests>[0]["supabaseFactory"] extends
    | ((t: string) => infer R)
    | undefined
    ? R
    : never;
}

// ---- Helpers ---------------------------------------------------------------

function makeReq(headers: Record<string, string> = {}, body: unknown = {}): Request {
  return new Request("http://local/api/realtime/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mintOk(overrides: Partial<{ expiresIn: number; model: string }> = {}) {
  const nowS = Math.floor(Date.now() / 1000);
  return new Response(
    JSON.stringify({
      value: "ek_secret_do_not_log",
      expires_at: nowS + (overrides.expiresIn ?? 60),
      session: { id: "sess_upstream", model: overrides.model ?? "gpt-realtime-2.1" },
    }),
    { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_abc" } },
  );
}

// ---- Tests ----------------------------------------------------------------

describe("POST /api/realtime/session", () => {
  const infoSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let logSink: string[] = [];

  beforeEach(() => {
    logSink = [];
    infoSpy.mockImplementation((...args: unknown[]) => {
      logSink.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_SAFETY_ID_SALT = "unit-test-salt-long-enough";
  });
  afterEach(() => {
    __resetRealtimeDepsForTests();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SAFETY_ID_SALT;
    infoSpy.mockClear();
  });

  it("returns 503 when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "voice_unavailable",
      message: "Voice is not configured.",
    });
  });

  it("returns 503 when OPENAI_SAFETY_ID_SALT is missing (fail closed, no unsalted hash)", async () => {
    delete process.env.OPENAI_SAFETY_ID_SALT;
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("voice_unavailable");
  });

  it("returns 401 when the bearer is missing or the user cannot be resolved", async () => {
    const anon = await handleMintRealtimeSession(makeReq());
    expect(anon.status).toBe(401);

    const state: FakeSupabaseState = { user: null, sessions: [], updates: [], authError: true };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    const bad = await handleMintRealtimeSession(makeReq({ authorization: "Bearer bogus" }));
    expect(bad.status).toBe(401);
  });

  it("returns 503 when the Supabase rate-lookup errors (not treated as zero sessions)", async () => {
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-123" },
      sessions: [],
      updates: [],
      selectError: { code: "PGRST000" },
    };
    let fetched = false;
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => {
        fetched = true;
        return mintOk();
      },
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect(fetched).toBe(false); // never called OpenAI
  });

  it("returns 429 when the hourly rate limit is hit", async () => {
    const nowIso = new Date().toISOString();
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-123" },
      sessions: Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        user_id: "user-uuid-123",
        started_at: nowIso,
        ended_at: nowIso,
      })),
      updates: [],
    };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => mintOk(),
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("returns 429 when 2 non-stale concurrent sessions are open", async () => {
    const nowIso = new Date().toISOString();
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-123" },
      sessions: [
        { id: "s1", user_id: "user-uuid-123", started_at: nowIso, ended_at: null },
        { id: "s2", user_id: "user-uuid-123", started_at: nowIso, ended_at: null },
      ],
      updates: [],
    };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => mintOk(),
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("too_many_concurrent");
  });

  it("ignores stale open sessions for concurrency", async () => {
    const staleIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-123" },
      sessions: [
        { id: "s1", user_id: "user-uuid-123", started_at: staleIso, ended_at: null },
        { id: "s2", user_id: "user-uuid-123", started_at: staleIso, ended_at: null },
      ],
      updates: [],
    };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => mintOk(),
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(200);
  });

  it("returns 503 without minting when the reserve-row insert fails", async () => {
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-123" },
      sessions: [],
      updates: [],
      insertError: { code: "PGRST-INSERT" },
    };
    let fetched = false;
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => {
        fetched = true;
        return mintOk();
      },
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect(fetched).toBe(false);
  });

  it("sends the correct OpenAI request (schema, safety identifier, no beta header)", async () => {
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-xyz" },
      sessions: [],
      updates: [],
    };
    let capturedUrl: string | null = null;
    let capturedInit: RequestInit | null = null;
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init ?? null;
        return mintOk();
      },
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    expect(capturedUrl).toBe("https://api.openai.com/v1/realtime/client_secrets");
    const init = capturedInit as unknown as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer sk-test");
    const safetyId = headers.get("OpenAI-Safety-Identifier");
    expect(safetyId).toMatch(/^conf_[0-9a-f]{32}$/);
    expect(headers.get("OpenAI-Beta")).toBeNull();
    const body = JSON.parse(String(init.body));
    expect(body.session.type).toBe("realtime");
    expect(body.session.model).toBe("gpt-realtime-2.1");
    expect(body.session.audio.output.voice).toBe("marin");
  });

  it("returns a sanitized 502 for upstream non-2xx and does NOT leak the body or user id", async () => {
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-xyz" },
      sessions: [],
      updates: [],
    };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () =>
        new Response("PROVIDER SECRET DETAILS SHOULD NOT LEAK", {
          status: 500,
          headers: { "x-request-id": "req_provider" },
        }),
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "upstream_error", message: "Voice service refused." });
    // The reserved row was closed:
    expect(state.updates.some((u) => u.patch.disconnect_reason === "mint_non_2xx")).toBe(true);
    // Logs never contain raw user id or raw provider body:
    const joined = logSink.join("\n");
    expect(joined).not.toContain("user-uuid-xyz");
    expect(joined).not.toContain("PROVIDER SECRET DETAILS SHOULD NOT LEAK");
    expect(joined).toMatch(/mint_upstream_non_2xx/);
    expect(joined).toMatch(/req_provider/); // OpenAI request id IS safe to log
  });

  it("returns a sanitized 502 for malformed upstream JSON", async () => {
    const state: FakeSupabaseState = { user: { id: "u1" }, sessions: [], updates: [] };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () =>
        new Response(JSON.stringify({ value: "", expires_at: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_error");
    expect(state.updates.some((u) => u.patch.disconnect_reason === "mint_unparseable")).toBe(true);
  });

  it("returns a sanitized 502 when the upstream fetch throws", async () => {
    const state: FakeSupabaseState = { user: { id: "u1" }, sessions: [], updates: [] };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => {
        throw new Error("ECONNRESET internal detail");
      },
    });
    const res = await handleMintRealtimeSession(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_unreachable");
    expect(logSink.join("\n")).not.toContain("ECONNRESET internal detail");
  });

  it("successful mint: returns sanitized shape and does not leak the user id or bearer", async () => {
    const state: FakeSupabaseState = {
      user: { id: "user-uuid-secret" },
      sessions: [],
      updates: [],
    };
    __setRealtimeDepsForTests({
      supabaseFactory: () => makeFakeSupabase(state) as never,
      fetchImpl: async () => mintOk(),
    });
    const res = await handleMintRealtimeSession(
      makeReq({ authorization: "Bearer super-secret-token" }, { draftId: undefined }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe("ek_secret_do_not_log");
    expect(body.sessionId).toMatch(/^sess_/);
    expect(body.model).toBe("gpt-realtime-2.1");
    expect(body.voice).toBe("marin");
    // Response never carries the user id, the bearer, or the OpenAI key:
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("user-uuid-secret");
    expect(raw).not.toContain("super-secret-token");
    expect(raw).not.toContain("sk-test");
    // Logs likewise:
    const joined = logSink.join("\n");
    expect(joined).not.toContain("user-uuid-secret");
    expect(joined).not.toContain("super-secret-token");
    expect(joined).not.toContain("sk-test");
  });
});
