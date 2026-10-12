import { describe, expect, it } from "vitest";
import { assertSafePerfTarget, PERF_EXPECTED_PROJECT } from "../scripts/perf-safety";

const previewUrl =
  `postgresql://postgres.${PERF_EXPECTED_PROJECT}:not-a-real-password@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;

function env(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PERF_ACK_NONPROD: "YES",
    DATABASE_SCHEMA: "visa_os_preview",
    DATABASE_URL: previewUrl,
    ...overrides,
  };
}

describe("performance tooling safety guard", () => {
  it("fails closed without explicit non-production acknowledgement", () => {
    expect(() => assertSafePerfTarget(env({ PERF_ACK_NONPROD: undefined }))).toThrow(/PERF_ACK_NONPROD/);
  });

  it("refuses the Production database schema", () => {
    expect(() => assertSafePerfTarget(env({ DATABASE_SCHEMA: "visa_os" }))).toThrow(/Production schema/);
  });

  it("refuses the Production hostname", () => {
    expect(() => assertSafePerfTarget(env(), "https://visa.essafariavoyages.com")).toThrow(/Production hostname/);
  });

  it("refuses a remote database outside the recorded Supabase project", () => {
    const wrong =
      "postgresql://postgres.wrongprojectref:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
    expect(() => assertSafePerfTarget(env({ DATABASE_URL: wrong }))).toThrow(/recorded ESSAFARIA Supabase project/);
  });

  it("allows only the recorded remote Preview target", () => {
    const target = assertSafePerfTarget(env(), "https://preview.example.test");
    expect(target.schema).toBe("visa_os_preview");
    expect(target.remote).toBe(true);
    expect(target.baseUrl).toBe("https://preview.example.test");
    expect(target.dbHost).toContain(".pooler.supabase.com");
  });

  it("allows a disposable localhost schema without pretending it is remote Preview", () => {
    const target = assertSafePerfTarget(env({
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/essafaria",
      DATABASE_SCHEMA: "perf_local",
    }));
    expect(target.remote).toBe(false);
    expect(target.schema).toBe("perf_local");
  });
});
