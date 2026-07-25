import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMintRealtimeSessionHandler } from "@/routes/api/realtime/session";

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
  insertHook?: () => void | Promise<void>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
  inserts: Array<Record<string, unknown>>;
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
        select() {
          return this;
        },
        eq(_col: string, _val: string) {
          return this;
        },
        gte(_col: string, _iso: string) {
          return this;
        },
        is(_col: string, _v: null) {
          return this;
        },
        then(resolve: (v: unknown) => unknown) {
          if (state.selectError) return resolve({ data: null, error: state.selectError });
          return resolve({ data: state.sessions, error: null });
        },
        insert(row: Record<string, unknown>) {
          state.inserts.push(row);
          const doInsert = async () => {
            if (state.insertHook) await state.insertHook();
            if (state.insertError) return { data: null, error: state.insertError };
            const newRow: FakeSession = {
              id: `sess_${state.sessions.length + 1}`,
              user_id: (row.user_id as string) ?? "u",
              started_at: new Date().toISOString(),
              ended_at: null,
            };
            state.sessions.push(newRow);
            return { data: { id: newRow.id }, error: null };
          };
          return {
            select: () => ({
              single: async () => doInsert(),
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          // Handles both chains used by session.ts:
          //   .update().eq("id",X).is("ended_at", null)                     (closeReservedSession)
          //   .update().eq("id",X).eq("user_id",Y).is("ended_at", null)     (performEndSession)
          const chain: {
            eq: (c: string, v: string) => typeof chain;
            is: (
              c: string,
              v: null,
            ) => Promise<{ data: null; error: null }> & {
              select: (cols: string) => Promise<{ data: unknown[]; error: null }>;
            };
          } = {
            eq: (_c: string, id: string) => {
              // remember first eq id for update matching
              (chain as unknown as { _id?: string })._id = id;
              return chain;
            },
            is: (_c: string, _v: null) => {
              const id = (chain as unknown as { _id?: string })._id;
              const doApply = () => {
                const row = state.sessions.find((s) => s.id === id);
                if (row && row.ended_at === null) {
                  row.ended_at = String(patch.ended_at ?? new Date().toISOString());
                  state.updates.push({ id: id ?? "?", patch });
                }
              };
              const promise = (async () => {
                doApply();
                return { data: null, error: null };
              })() as Promise<{ data: null; error: null }> & {
                select: (cols: string) => Promise<{ data: unknown[]; error: null }>;
              };
              promise.select = async (_cols: string) => {
                doApply();
                return { data: [{ id }], error: null };
              };
              return promise;
            },
          };
          return chain;
        },
      };
      return api;
    },
  };
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

function makeState(partial: Partial<FakeSupabaseState> = {}): FakeSupabaseState {
  return {
    user: { id: "user-uuid-123" },
    sessions: [],
    updates: [],
    inserts: [],
    ...partial,
  };
}

function bind(state: FakeSupabaseState, fetchImpl: typeof fetch) {
  return createMintRealtimeSessionHandler({
    supabaseFactory: () => makeFakeSupabase(state) as never,
    fetchImpl,
  });
}

// ---- Tests ----------------------------------------------------------------

describe("POST /api/realtime/session", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let logSink: string[] = [];

  beforeEach(() => {
    logSink = [];
    errorSpy.mockImplementation((...args: unknown[]) => {
      logSink.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
    process.env.OPENAI_API_KEY = "sk-test-do-not-log";
    process.env.OPENAI_SAFETY_ID_SALT = "unit-test-salt-long-enough";
  });
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SAFETY_ID_SALT;
    errorSpy.mockClear();
  });

  // ---- Auth-before-config (privacy release-blocker) ----------------------

  it("no bearer → 401 even when OPENAI_API_KEY is missing (no config disclosure)", async () => {
    delete process.env.OPENAI_API_KEY;
    const handler = createMintRealtimeSessionHandler({
      supabaseFactory: () => makeFakeSupabase(makeState()) as never,
      fetchImpl: async () => mintOk(),
    });
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("no bearer → 401 even when OPENAI_SAFETY_ID_SALT is missing", async () => {
    delete process.env.OPENAI_SAFETY_ID_SALT;
    const handler = createMintRealtimeSessionHandler({
      supabaseFactory: () => makeFakeSupabase(makeState()) as never,
      fetchImpl: async () => mintOk(),
    });
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
  });

  it("invalid bearer → 401 even when key is missing (verified BEFORE config)", async () => {
    delete process.env.OPENAI_API_KEY;
    const state = makeState({ user: null, authError: true });
    const handler = bind(state, async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
  });

  it("valid bearer + missing key → 503 (only reached after auth passes)", async () => {
    delete process.env.OPENAI_API_KEY;
    const handler = bind(makeState(), async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("voice_unavailable");
  });

  it("valid bearer + missing salt → 503", async () => {
    delete process.env.OPENAI_SAFETY_ID_SALT;
    const handler = bind(makeState(), async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("voice_unavailable");
  });

  // ---- Rate / concurrency ------------------------------------------------

  it("rate-lookup DB error → 503 and never calls OpenAI", async () => {
    const state = makeState({ selectError: { code: "PGRST000" } });
    let fetched = false;
    const handler = bind(state, async () => {
      fetched = true;
      return mintOk();
    });
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect(fetched).toBe(false);
  });

  it("hourly limit (5) → 429 rate_limited", async () => {
    const nowIso = new Date().toISOString();
    const state = makeState({
      sessions: Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        user_id: "user-uuid-123",
        started_at: nowIso,
        ended_at: nowIso,
      })),
    });
    const handler = bind(state, async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("2 non-stale concurrent → 429 too_many_concurrent", async () => {
    const nowIso = new Date().toISOString();
    const state = makeState({
      sessions: [
        { id: "s1", user_id: "user-uuid-123", started_at: nowIso, ended_at: null },
        { id: "s2", user_id: "user-uuid-123", started_at: nowIso, ended_at: null },
      ],
    });
    const handler = bind(state, async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(429);
  });

  it("stale open sessions are ignored for concurrency", async () => {
    const staleIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const state = makeState({
      sessions: [
        { id: "s1", user_id: "user-uuid-123", started_at: staleIso, ended_at: null },
        { id: "s2", user_id: "user-uuid-123", started_at: staleIso, ended_at: null },
      ],
    });
    const handler = bind(state, async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(200);
  });

  // ---- Reservation payload & correctness ---------------------------------

  it("reserves the row with model = REALTIME_MODEL (not null)", async () => {
    const state = makeState();
    const handler = bind(state, async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      user_id: "user-uuid-123",
      model: "gpt-realtime-2.1",
    });
  });

  it("reserve insert failure → 503 and never mints", async () => {
    const state = makeState({ insertError: { code: "PGRST-INSERT" } });
    let fetched = false;
    const handler = bind(state, async () => {
      fetched = true;
      return mintOk();
    });
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(503);
    expect(fetched).toBe(false);
  });

  // ---- Concurrent Promise.all (single-node atomicity) -------------------

  it(
    "5 concurrent requests with concurrency=2 admit at most 2 mints; " +
      "in-process mutex + post-insert recount enforce the single-node bound",
    async () => {
      const state = makeState();
      // Slow the fetch so requests overlap in flight.
      const handler = bind(state, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return mintOk();
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => handler(makeReq({ authorization: "Bearer t" }))),
      );
      const statuses = results.map((r) => r.status).sort();
      const successes = statuses.filter((s) => s === 200);
      const rejects = statuses.filter((s) => s === 429);
      expect(successes.length).toBe(2);
      expect(rejects.length).toBe(3);
    },
  );

  // ---- Upstream + sanitized errors ---------------------------------------

  it("upstream non-2xx → sanitized 502 and closes the reservation", async () => {
    const state = makeState({ user: { id: "user-uuid-xyz" } });
    const handler = bind(
      state,
      async () =>
        new Response("PROVIDER SECRET DETAILS SHOULD NOT LEAK", {
          status: 500,
          headers: { "x-request-id": "req_provider" },
        }),
    );
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "upstream_error",
      message: "Voice service refused.",
    });
    expect(state.updates.some((u) => u.patch.disconnect_reason === "mint_non_2xx")).toBe(true);
  });

  it("upstream throws → sanitized 502 upstream_unreachable", async () => {
    const state = makeState();
    const handler = bind(state, async () => {
      throw new Error("ECONNRESET internal detail");
    });
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_unreachable");
  });

  it("upstream malformed json → sanitized 502 and closes reservation", async () => {
    const state = makeState();
    const handler = bind(
      state,
      async () =>
        new Response(JSON.stringify({ value: "", expires_at: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_error");
    expect(state.updates.some((u) => u.patch.disconnect_reason === "mint_unparseable")).toBe(true);
  });

  it("sends the correct OpenAI request (schema, safety identifier, no beta header)", async () => {
    const state = makeState({ user: { id: "user-uuid-xyz" } });
    let capturedUrl: string | null = null;
    let capturedInit: RequestInit | null = null;
    const handler = bind(state, async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init ?? null;
      return mintOk();
    });
    const res = await handler(makeReq({ authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    expect(capturedUrl).toBe("https://api.openai.com/v1/realtime/client_secrets");
    const headers = new Headers((capturedInit as unknown as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer sk-test-do-not-log");
    expect(headers.get("OpenAI-Safety-Identifier")).toMatch(/^conf_[0-9a-f]{32}$/);
    expect(headers.get("OpenAI-Beta")).toBeNull();
    const body = JSON.parse(String((capturedInit as unknown as RequestInit).body));
    expect(body.session.type).toBe("realtime");
    expect(body.session.model).toBe("gpt-realtime-2.1");
    expect(body.session.audio.output.voice).toBe("marin");
  });

  it("successful mint response never leaks user id, bearer, or api key", async () => {
    const state = makeState({ user: { id: "user-uuid-secret" } });
    const handler = bind(state, async () => mintOk());
    const res = await handler(makeReq({ authorization: "Bearer super-secret-token" }));
    expect(res.status).toBe(200);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("user-uuid-secret");
    expect(raw).not.toContain("super-secret-token");
    expect(raw).not.toContain("sk-test-do-not-log");
  });

  // ---- Log-spy privacy assertion (the release blocker) ------------------

  it(
    "log payloads NEVER contain: safety id (conf_), user id, bearer, api key, " +
      "or raw provider body — across success and every failure branch",
    async () => {
      const forbidden = [
        /conf_[0-9a-f]{8,}/, // safety id (now header-only, not logged)
        /user-uuid-[A-Za-z0-9-]+/, // raw supabase user id
        /super-secret-token/, // bearer
        /sk-test-do-not-log/, // openai api key
        /PROVIDER SECRET DETAILS SHOULD NOT LEAK/, // raw upstream body
        /ECONNRESET internal detail/, // raw fetch error
      ];

      const runAndCheck = async (fn: () => Promise<Response>) => {
        logSink = [];
        await fn();
        const joined = logSink.join("\n");
        for (const p of forbidden) {
          expect(joined, `forbidden pattern ${p} in log: ${joined}`).not.toMatch(p);
        }
      };

      // success
      await runAndCheck(async () =>
        bind(makeState({ user: { id: "user-uuid-secret" } }), async () => mintOk())(
          makeReq({ authorization: "Bearer super-secret-token" }),
        ),
      );

      // rate-lookup DB failure
      await runAndCheck(async () =>
        bind(
          makeState({ user: { id: "user-uuid-secret" }, selectError: { code: "PGRST000" } }),
          async () => mintOk(),
        )(makeReq({ authorization: "Bearer super-secret-token" })),
      );

      // reserve insert failure
      await runAndCheck(async () =>
        bind(
          makeState({ user: { id: "user-uuid-secret" }, insertError: { code: "PGRST-INSERT" } }),
          async () => mintOk(),
        )(makeReq({ authorization: "Bearer super-secret-token" })),
      );

      // upstream non-2xx (raw body)
      await runAndCheck(async () =>
        bind(
          makeState({ user: { id: "user-uuid-secret" } }),
          async () =>
            new Response("PROVIDER SECRET DETAILS SHOULD NOT LEAK", {
              status: 500,
              headers: { "x-request-id": "req_provider" },
            }),
        )(makeReq({ authorization: "Bearer super-secret-token" })),
      );

      // upstream fetch throws
      await runAndCheck(async () =>
        bind(makeState({ user: { id: "user-uuid-secret" } }), async () => {
          throw new Error("ECONNRESET internal detail");
        })(makeReq({ authorization: "Bearer super-secret-token" })),
      );
    },
  );

  it("OpenAI request id IS logged (it is a safe correlation id)", async () => {
    const state = makeState();
    const handler = bind(
      state,
      async () =>
        new Response("boom", { status: 500, headers: { "x-request-id": "req_provider_123" } }),
    );
    await handler(makeReq({ authorization: "Bearer t" }));
    expect(logSink.join("\n")).toMatch(/req_provider_123/);
    expect(logSink.join("\n")).toMatch(/mint_upstream_non_2xx/);
  });
});
