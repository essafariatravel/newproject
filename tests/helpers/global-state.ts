/**
 * Shared before/after for every suite: boot PG once, reset data per suite.
 * Fixtures are re-seeded per suite for isolation.
 */
import { beforeAll } from "vitest";
import { resetData, testDbReady } from "./pg";
import { seedFixtures } from "./fixtures";

/** Boot the shared test PostgreSQL once, reset data and seed fixtures per suite. */
export function suiteSetup() {
  beforeAll(async () => {
    await testDbReady();
    await resetData();
    await seedFixtures();
  });
}
