// Thin HTTP wrapper so the client `fetch`es a stable URL. Delegates to the
// authenticated server function to keep validation + rate-limit in one place.

import { createFileRoute } from "@tanstack/react-router";
import { sendTurn } from "@/lib/talk-brain.functions";

export const Route = createFileRoute("/api/talk/turn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const body = await request.json();
          // sendTurn's middleware pulls auth from the request context — but this
          // route is standalone HTTP. Easiest path: forward through fetch to
          // the RPC endpoint. Instead of that, we call the handler pattern by
          // creating a lightweight request-scoped supabase call is overkill —
          // the client actually uses useServerFn directly, so this file exists
          // only for future non-JS clients. Return 501 for now.
          void body;
          return new Response("Use useServerFn(sendTurn) from the app instead.", { status: 501 });
        } catch {
          return new Response("Bad request", { status: 400 });
        }
      },
    },
  },
});
