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
      // Only modules with a focused unit suite. This is a regression floor
      // for tested logic, not a project-wide coverage target.
      include: [
        "src/lib/affiliates.ts",
        "src/lib/holiday-packs.ts",
        "src/lib/parties-summary.ts",
        "src/lib/realtime-session.ts",
        "src/lib/shopping.ts",
        "src/lib/talk-demo.ts",
        "src/lib/talk-client.ts",
        "src/components/logo.tsx",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 85,
        branches: 75,
      },
    },


  },
});
