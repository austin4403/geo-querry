import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        // The Neon Auth SDK is ESM-only and imports bare "next/headers" /
        // "next/server" specifiers that Node cannot resolve outside Next's
        // bundler — inline it so vite's resolver (with the alias below) handles them.
        inline: ["@neondatabase/auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./lib/__mocks__/server-only.ts"),
      // Next 16 has no package exports map, so the bare "next/headers"
      // specifier that @neondatabase/auth/next/server imports only resolves
      // inside Next's bundler — point vitest at the real file.
      "next/headers": path.resolve(__dirname, "./node_modules/next/headers.js"),
    },
  },
});
