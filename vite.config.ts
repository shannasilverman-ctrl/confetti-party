import path from "node:path";
import { execFileSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

function resolveReleaseSha() {
  const configured = process.env.CONFETTI_RELEASE_SHA ?? process.env.GITHUB_SHA;
  if (configured && /^[0-9a-f]{40}$/i.test(configured)) return configured.toLowerCase();

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Provider-neutral application build.
 *
 * TanStack Start owns routing and SSR. Nitro emits a Cloudflare Worker for
 * production, while Vite serves the same application locally. Keeping this
 * configuration in-repo makes the deploy artifact reproducible without an
 * editor-specific build wrapper.
 */
export default defineConfig(({ command }) => ({
  css: { transformer: "lightningcss" },
  define: {
    __CONFETTI_RELEASE_SHA__: JSON.stringify(resolveReleaseSha()),
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // Redirect the bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    command === "build"
      ? nitro({
          preset: "cloudflare-module",
          cloudflare: {
            nodeCompat: true,
            deployConfig: true,
          },
        })
      : null,
    react(),
  ],
  server: {
    host: "::",
    port: 8080,
    watch: {
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    },
  },
}));
