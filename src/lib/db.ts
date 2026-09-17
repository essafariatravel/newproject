import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  var __evosPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/essafaria";
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Shared pg pool (survives HMR in dev). */
export const pool: Pool = globalThis.__evosPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__evosPool = pool;

/** Drizzle handle for typed queries. */
export const db = drizzle(pool, { schema });

export { schema };
