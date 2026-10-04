import { defineConfig } from "vitest/config";
import path from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";

class DatabaseSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const ordered = await super.sort(files);
    return ordered.sort((a, b) => Number(a.moduleId.endsWith("/zz-teardown.test.ts")) - Number(b.moduleId.endsWith("/zz-teardown.test.ts")));
  }
}

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
    maxWorkers: 1,
    sequence: { sequencer: DatabaseSequencer },
    setupFiles: ["./tests/helpers/env.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
