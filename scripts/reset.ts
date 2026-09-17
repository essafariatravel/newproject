/**
 * Drop and recreate the public schema (development reset).
 * Usage: npm run db:reset
 */
import { Pool } from "pg";

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/essafaria";
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      drop schema public cascade;
      create schema public;
      create extension if not exists pgcrypto;
    `);
    console.log("Schema reset complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
