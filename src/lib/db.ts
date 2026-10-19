import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { databasePoolConfig } from "./database-config";
import { logErrorOnce } from "./observability";

declare global {
  var __evosPool: Pool | undefined;
}

function createPool(): Pool {
  const pool = new Pool(databasePoolConfig());
  // Idle socket errors must not crash a serverless instance or expose driver details.
  pool.on("error", (error) => {
    logErrorOnce("database.pool.error", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      action: "pool",
    });
  });
  return pool;
}

/** Shared pg pool (survives HMR in dev). */
export const pool: Pool = globalThis.__evosPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__evosPool = pool;

/** Drizzle handle for typed queries. */
export const db = drizzle(pool, { schema });

export { schema };
