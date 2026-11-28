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
import { automaticDatabaseChangesForbidden } from "./lib/build-policy";
import { configuredStorageProvider } from "../src/lib/storage-config";

function run(script: string, args: string[]): number {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  return result.status ?? 1;
}

function main(): void {
  console.log(`[build] Verified storage provider: ${configuredStorageProvider()}`);
  // Dependency-free policy/EN-FR-AR verification in both Preview and Production.
  // No database connection, no session mutations, and no external service calls.
  if (run("node_modules/tsx/dist/cli.mjs", ["scripts/verify-session-inactivity.ts"]) !== 0) process.exit(1);
  if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
    if (run("node_modules/tsx/dist/cli.mjs", ["essafaria-private-stage-readonly.mjs"]) !== 0) process.exit(1);
  }
  const isVercelPreview = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const databaseChangesForbidden = automaticDatabaseChangesForbidden(process.env.VERCEL_GIT_COMMIT_REF);

  if (databaseChangesForbidden && isVercelPreview) {
    console.log("[build] Protected Preview branch: database migrations, seeding, and bootstrap verification are disabled.");
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

  if (isVercelPreview && process.env.VERCEL_GIT_COMMIT_REF === "codex/phase2c-document-intelligence-20261126") {
    // Pure UX regression checks for this protected Preview only.
    if (run("node_modules/tsx/dist/cli.mjs", ["scripts/verify-agency-ux.ts"]) !== 0) process.exit(1);
    if (run("scripts/prepare-local-face.mjs", []) !== 0) process.exit(1);
    if (run("scripts/prepare-local-pdf.mjs", []) !== 0) process.exit(1);
    if (run("scripts/prepare-local-analysis.mjs", []) !== 0) process.exit(1);
    if (run("node_modules/tsx/dist/cli.mjs", ["scripts/verify-phase2c.ts"]) !== 0) process.exit(1);
  }
  if(isVercelPreview&&[ "codex/phase2c-document-intelligence-20261126", "codex/phase2d-traveller-hub-20261128"].includes(process.env.VERCEL_GIT_COMMIT_REF??"")){if(run("node_modules/tsx/dist/cli.mjs",["scripts/verify-traveller-hub.ts"])!==0)process.exit(1);}
  if (run("node_modules/tsx/dist/cli.mjs", ["scripts/verify-decision-dialog.ts"]) !== 0) process.exit(1);
  process.exit(run("node_modules/next/dist/bin/next", ["build"]));
}

main();
