// Import this before modules that construct a database pool.
// Loads .env* files when available (local development). On CI/GitHub runners
// the real environment is injected by the workflow, so the optional package
// `@next/env` (a pnpm non-hoisted next sub-package) may be absent — skip then.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // @next/env is optional tooling; when absent, real env vars (CI) carry config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { loadEnvConfig } = require("@next/env") as { loadEnvConfig: (cwd: string) => void };
  loadEnvConfig(process.cwd());
} catch {
  // no .env loader available — the process environment must already carry DATABASE_URL etc.
}
