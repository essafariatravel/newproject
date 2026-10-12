import { defineConfig } from "vitest/config";
import path from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";

class DatabaseSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    // Vitest's default sequencer may use historical duration data, which makes
    // the order vary between developer and CI machines. These suites share one
    // embedded PostgreSQL cluster, so a deterministic order is required for
    // reproducible reset/teardown behavior; the sentinel teardown is always last.
    return [...files].sort((a, b) => {
      const aTeardown = a.moduleId.endsWith("/zz-teardown.test.ts");
      const bTeardown = b.moduleId.endsWith("/zz-teardown.test.ts");
      if (aTeardown !== bTeardown) return Number(aTeardown) - Number(bTeardown);
      const order = a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0;
      return process.env.ESSAFARIA_TEST_REVERSE === "1" ? -order : order;
    });
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
