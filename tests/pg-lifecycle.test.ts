import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { testConnectionString, testDbReady } from "./helpers/pg";

it("shares one readiness owner across concurrent callers and module resets", async () => {
  const ready = testDbReady();
  expect(testDbReady()).toBe(ready);
  await Promise.all(Array.from({ length: 8 }, () => testDbReady()));
  vi.resetModules();
  const reloaded = await import("./helpers/pg");
  expect(reloaded.testDbReady()).toBe(ready);
  const pools = Array.from({ length: 4 }, () => new Pool({ connectionString: testConnectionString() }));
  try {
    const results = await Promise.all(pools.map(pool => pool.query("select current_database() name")));
    expect(results.map(result => result.rows[0].name)).toEqual(Array(4).fill("essafaria_test"));
  } finally { await Promise.all(pools.map(pool => pool.end())); }
});
