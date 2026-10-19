import { describe, expect, it } from "vitest";
import { assertSafePerfTarget } from "../scripts/perf-safety";
import { localPerfSessionToken } from '../perf/local-safety.js';

describe('actual application cookie formats in local compiled-runtime evidence',()=>{
  it.each(['evos_session','__Host-evos_session'])('accepts only the actual %s cookie without changing its name',name=>{
    expect(localPerfSessionToken(name+'=synthetic-token_123')).toBe('synthetic-token_123');
  });
  it.each(['arbitrary=synthetic','evos_session=a; another=b','__Secure-evos_session=a','evos_session=','evos_session=a\r\nx-header:b'])('rejects an unsupported or multi-cookie header',cookie=>{
    expect(()=>localPerfSessionToken(cookie)).toThrow('HOSTED_PERF_DISABLED');
  });
});

function env(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test", PERF_ACK_NONPROD: "YES", DATABASE_SCHEMA: "perf_local",
    DATABASE_URL: "postgresql://postgres:synthetic-password@127.0.0.1:5432/essafaria",
    BASE_URL: "http://127.0.0.1:3000", ...overrides,
  };
}

describe("local-only performance tooling safety", () => {
  it("requires an explicit acknowledgement and database connection", () => {
    expect(() => assertSafePerfTarget(env({ PERF_ACK_NONPROD: undefined }))).toThrow(/PERF_ACK_NONPROD/);
    expect(() => assertSafePerfTarget(env({ DATABASE_URL: undefined }))).toThrow(/DATABASE_URL/);
  });
  it("refuses the Production schema even on loopback", () => {
    expect(() => assertSafePerfTarget(env({ DATABASE_SCHEMA: "visa_os" }))).toThrow(/Production schema/);
  });
  it.each(["localhost", "127.0.0.1", "[::1]"])("accepts canonical HTTP and PostgreSQL loopback %s", (host) => {
    expect(assertSafePerfTarget(env({ DATABASE_URL: `postgresql://postgres:synthetic@${host}:5432/essafaria`, BASE_URL: `http://${host}:3000` })))
      .toMatchObject({ remote: false, baseUrl: `http://${host}:3000`, schema: "perf_local" });
  });
  it.each([
    "https://preview.example.test", "https://visa.essafariavoyages.com", "http://example.test", "https://localhost:3000",
    "http://127.1:3000", "http://2130706433:3000", "http://0x7f000001:3000", "http://127.000.000.001:3000",
    "http://localhost.:3000", "http://localhost.evil.test:3000", "http://user:secret@localhost:3000",
    "http://localhost:3000/path", "http://localhost:3000?host=cloud", "http://localhost:3000#cloud",
    "http://localhost:0", "http://localhost:65536", " http://localhost:3000",
  ])("rejects a hosted or ambiguous HTTP target %s", (BASE_URL) => {
    expect(() => assertSafePerfTarget(env({ BASE_URL }))).toThrow(/HOSTED_PERF_DISABLED/);
  });
  it.each([
    "postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:synthetic@db.xgetzgixalrsmuvfthpf.supabase.co:5432/postgres",
    "postgresql://postgres:synthetic@192.168.1.10:5432/local", "postgresql://postgres:synthetic@127.1:5432/local",
    "postgresql://postgres:synthetic@localhost.:5432/local", "postgresql://postgres:synthetic@localhost:5432/local?host=cloud.example",
    "postgresql://postgres:synthetic@localhost:5432/local?hostaddr=203.0.113.2", "postgresql://postgres:synthetic@localhost:5432/local?sslkey=/private/key.pem",
    "postgresql://postgres:synthetic@localhost:5432/local?service=hosted", "postgresql://postgres:synthetic@localhost:5432/local?sslmode=verify-full",
    "postgresql://postgres:synthetic@localhost:65536/local", "postgresql://postgres:synthetic@localhost:5432/local#ignored", "not-a-url-with-synthetic-secret",
  ])("rejects hosted databases, route overrides and credential-file options", (DATABASE_URL) => {
    expect(() => assertSafePerfTarget(env({ DATABASE_URL }))).toThrow(/HOSTED_PERF_DISABLED/);
    try { assertSafePerfTarget(env({ DATABASE_URL })); } catch (error) { expect(String(error)).not.toContain("synthetic-secret"); }
  });
  it.each([
    "VERCEL_ENV", "VERCEL_URL", "VERCEL_AUTOMATION_BYPASS_SECRET", "NEXT_PUBLIC_VERCEL_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "AWS_ACCESS_KEY_ID", "AWS_PROFILE",
    "GOOGLE_APPLICATION_CREDENTIALS", "AZURE_CLIENT_SECRET", "GITHUB_TOKEN", "GH_TOKEN", "BREVO_API_KEY", "RESEND_API_KEY", "S3_BUCKET",
    "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGHOST", "PGSSLKEY",
    "Supabase_Service_Role_Key", "Netlify", "Render", "CF_PAGES", "NPM_TOKEN", "NODE_AUTH_TOKEN", "MFA_ENCRYPTION_KEY",
    "HTTP_PROXY", "https_proxy", "ALL_PROXY", "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "K6_CLOUD_TOKEN", "K6_OUT", "K6_OTEL_EXPORTER_OTLP_ENDPOINT", "K6_INFLUXDB_TOKEN", "K6_CONFIG",
  ])("rejects hosted metadata or cloud configuration before use: %s", (name) => {
    expect(() => assertSafePerfTarget(env({ [name]: "synthetic-unused" }))).toThrow(/HOSTED_PERF_DISABLED/);
  });
  it("also rejects a remote secondary migration database and explicit base URL", () => {
    expect(() => assertSafePerfTarget(env({ database_url: "postgresql://u:p@cloud.test/db" }))).toThrow(/HOSTED_PERF_DISABLED/);
    expect(() => assertSafePerfTarget(env({ MIGRATION_DATABASE_URL: "postgresql://u:p@cloud.test/db" }))).toThrow(/HOSTED_PERF_DISABLED/);
    expect(() => assertSafePerfTarget(env(), "http://cloud.test")).toThrow(/HOSTED_PERF_DISABLED/);
  });
  it("permits production-mode local servers, absent HTTP for SQL-only tools and local TLS disable", () => {
    expect(assertSafePerfTarget(env({ NODE_ENV: "production", VERCEL: "0", BASE_URL: undefined,
      DATABASE_URL: "postgres://postgres:synthetic@localhost:5432/local?sslmode=disable" }))).toMatchObject({ remote: false, baseUrl: null });
  });
});
