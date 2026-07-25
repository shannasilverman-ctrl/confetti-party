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
      include: ["src/lib/**/*.{ts,tsx}", "src/components/logo.tsx"],
      exclude: ["src/lib/**/*.functions.ts", "src/lib/**/*.server.ts"],
      // Conservative floors reflecting current focused suite: prevent regressions
      // in the pure-logic modules exercised by tests (rsvp math, party summary,
      // seasonal, holiday packs, talk demo, logo). Not a coverage target.
      thresholds: {
        lines: 55,
        statements: 55,
        functions: 60,
        branches: 70,
      },
    },

  },
});
