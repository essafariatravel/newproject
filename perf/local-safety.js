// Shared by Node tooling and k6. No I/O, environment loading, URL normalization,
// DNS resolution or credential acquisition may precede this policy.
function refuse(reason) {
  throw new Error(`HOSTED_PERF_DISABLED: ${reason}; performance tooling is local-only.`);
}

function validPort(port) {
  return !port || (Number(port) >= 1 && Number(port) <= 65535);
}

export function assertLocalHttpOrigin(value) {
  const match = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?\/?$/.exec(value);
  if (!match || !validPort(match[2])) refuse("BASE_URL must be a canonical loopback HTTP origin");
  return value.replace(/\/$/, "");
}

export function assertLocalPostgresUrl(value) {
  // Restrict the original spelling, before URL() can normalize numeric aliases.
  // Reject query routing overrides and all TLS/credential-file parameters.
  const match = /^(?:postgres|postgresql):\/\/(?:[^/?#@\s\\]+@)?(localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?\/[a-zA-Z0-9_-]+(?:\?sslmode=disable)?$/.exec(value);
  if (!match || !validPort(match[2])) refuse("database URLs must use canonical loopback PostgreSQL without routing or credential-file options");
  return value;
}

export function assertLocalPerfEnvironment(env) {
  const normalized = {};
  for (const key of Object.keys(env)) {
    if (!env[key]) continue;
    const name = key.toUpperCase();
    if (normalized[name] && normalized[name] !== env[key]) refuse("conflicting environment key spelling");
    normalized[name] = env[key];
    if (name === "VERCEL" && ["0", "false"].includes(env[key])) continue;
    if (/^(?:VERCEL(?:_|$)|NEXT_PUBLIC_VERCEL_|(?:NEXT_PUBLIC_)?SUPABASE_|AWS_|AZURE_|GOOGLE_|GCP_|FIREBASE_|S3_|R2_|UPSTASH_|CLOUDINARY_|NETLIFY(?:_|$)|RENDER(?:_|$)|CF_PAGES|FLY_|DIGITALOCEAN_|BREVO_|RESEND_|STRIPE_|PG[A-Z_]|K6_(?:CLOUD|OUT|OTEL|INFLUXDB|PROMETHEUS|STATSD|DATADOG|CONFIG|WEB_DASHBOARD))/.test(name) ||
        ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN", "MFA_ENCRYPTION_KEY", "HEALTHCHECK_TOKEN", "PREVIEW_BASE_URL", "CONSOLIDATION_PREVIEW_URL", "EXPECTED_SUPABASE_PROJECT"].includes(name)) {
      // Never include the value: it can be a credential or a private path.
      refuse(`remove hosted metadata, cloud credentials or implicit PostgreSQL configuration (${name})`);
    }
  }
  if (normalized.BASE_URL) assertLocalHttpOrigin(normalized.BASE_URL);
  for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL", "DIRECT_DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"]) {
    if (normalized[name]) assertLocalPostgresUrl(normalized[name]);
  }
}
