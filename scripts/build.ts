/**
 * Build entry point (Vercel and local `npm run build`).
 *
 * Guarantees:
 * - `next build` NEVER requires DATABASE_URL. Vercel Preview environment
 *   variables can be missing or scoped to other branches, and every route is
 *   dynamic with graceful database fallbacks — a missing variable must fail
 *   queries at runtime, never the build.
 * - On Vercel PREVIEW builds only, when DATABASE_URL is present, the
 *   repository's existing idempotent migrations are applied first
 *   (ledger-guarded, advisory-lock serialized, no reset, no data deletion), so
 *   a fresh Supabase project becomes usable without anyone writing SQL.
 * - Optional demo data for Preview: runs only when ALLOW_DEMO_SEED=true, and
 *   the seed script itself still enforces its own production/remote
 *   guardrails (non-default passwords required for non-local databases).
 * - PRODUCTION builds never run migrations or seeding.
 * - A failed database step logs the reason and never fails the build.
 */
import { spawnSync } from "node:child_process";

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return result.status ?? 1;
}

function main(): void {
  const isVercelPreview = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  if (isVercelPreview && hasDatabaseUrl) {
    console.log("[build] Vercel Preview build with DATABASE_URL: applying migrations if any are outstanding.");
    if (run("npm", ["run", "db:migrate"]) !== 0) {
      console.warn(
        "[build] Migration step failed (details above). Continuing the build: the application serves " +
          "safe errors while the database is unavailable. Nothing was reset, repaired or seeded.",
      );
    }
    if (process.env.ALLOW_DEMO_SEED === "true") {
      console.log("[build] ALLOW_DEMO_SEED=true: running the demo seed for this Preview database.");
      if (run("npm", ["run", "db:seed"]) !== 0) {
        console.warn("[build] Demo seed failed (details above). Continuing the build.");
      }
    }
    console.log("[build] Read-only database verification (result goes to the build log only):");
    if (run("npm", ["run", "db:verify"]) !== 0) {
      console.warn("[build] Verification failed (details above). Continuing the build.");
    }
  } else if (isVercelPreview) {
    console.warn(
      "[build] Vercel Preview build WITHOUT DATABASE_URL: skipping database steps. Login will show " +
        '"Service temporarily unavailable" until DATABASE_URL is available to this branch\'s Preview ' +
        "(Vercel → Settings → Environment Variables, no branch filter), followed by a redeploy.",
    );
  }

  process.exit(run("npx", ["next", "build"]));
}

main();
