import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Modules with a focused unit suite. This is a regression floor for
      // tested logic, NOT a project-wide coverage target — do not describe
      // 100% here as project coverage. `src/lib/talk-client.ts` has mocked
      // handshake tests (see tests/unit/session-route.test.ts and manual
      // realtime harness) but is intentionally EXCLUDED from thresholds
      // because its WebRTC path depends on a real browser + provider and
      // measuring line coverage under jsdom would be misleading.
      include: [
        "src/lib/affiliates.ts",
        "src/lib/holiday-packs.ts",
        "src/lib/parties-summary.ts",
        "src/lib/realtime-session.ts",
        "src/lib/rsvp.functions.ts",
        "src/lib/shopping.ts",
        "src/lib/talk-demo.ts",
        "src/components/logo.tsx",
      ],

      thresholds: {
        // Aggregate floor across the focused list. `rsvp.functions.ts` pulls
        // the numbers down because the createServerFn wrapper only executes
        // in a server runtime; its pure resolver (`resolveRsvpLoaderData`)
        // is fully unit-tested. Floors reflect actually measured lines.
        lines: 80,
        statements: 75,
        functions: 80,
        branches: 70,
      },

    },
  },
});
