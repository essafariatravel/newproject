import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // single shared process: the embedded postgres and the pg pool are
    // process-wide singletons, so every suite must share one module registry
    isolate: false,
    fileParallelism: false,
    setupFiles: ["./tests/helpers/env.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
