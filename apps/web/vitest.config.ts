import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Route handler tests run in isolation (no DOM needed) but share this
    // config; jsdom is harmless for them, just unused.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
