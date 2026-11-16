import { afterAll, it } from "vitest";
import { teardownTestDb } from "./helpers/pg";

/**
 * Last file alphabetically — shuts the embedded PostgreSQL down at the very
 * end of the run. Its afterAll belongs ONLY to this file, so no other test
 * file may import it.
 */
it("runs last", () => {
  // marker only
});

afterAll(async () => {
  await teardownTestDb();
});
