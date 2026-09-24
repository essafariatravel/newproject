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
 * - Configured Preview database failures fail the deployment, rather than
 *   marking a broken login/catalogue as ready.
 */
import { spawnSync } from "node:child_process";

function run(script: string, args: string[]): number {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  return result.status ?? 1;
}

function main(): void {
  const isVercelPreview = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const isRedesignBranch = process.env.VERCEL_GIT_COMMIT_REF === "codex/essafaria-premium-redesign";

  if (isRedesignBranch && isVercelPreview) {
    console.log("[build] Redesign Preview: database migrations, seeding, and bootstrap verification are disabled.");
  } else if (isVercelPreview && hasDatabaseUrl) {
    console.log("[build] Vercel Preview build with DATABASE_URL: applying migrations if any are outstanding.");
    if (run("node_modules/tsx/dist/cli.mjs", ["scripts/migrate.ts"]) !== 0) {
      console.error("[build] Migration failed. Deployment stopped; no seed will run.");
      process.exit(1);
    }
    if (process.env.ALLOW_DEMO_SEED === "true") {
      console.log("[build] ALLOW_DEMO_SEED=true: running the demo seed for this Preview database.");
      if (run("node_modules/tsx/dist/cli.mjs", ["scripts/seed.ts"]) !== 0) {
        console.error("[build] Demo seed failed. Deployment stopped.");
        process.exit(1);
      }
    }
    console.log("[build] Read-only database verification (result goes to the build log only):");
    if (run("node_modules/tsx/dist/cli.mjs", ["scripts/verify-db.ts"]) !== 0) {
      console.error("[build] Database verification failed. Deployment stopped.");
      process.exit(1);
    }
  } else if (isVercelPreview) {
    console.warn(
      "[build] Vercel Preview build WITHOUT DATABASE_URL: skipping database steps. Login will show " +
        '"Service temporarily unavailable" until DATABASE_URL is available to this branch\'s Preview ' +
        "(Vercel → Settings → Environment Variables, no branch filter), followed by a redeploy.",
    );
  }

  process.exit(run("node_modules/next/dist/bin/next", ["build"]));
}

main();
