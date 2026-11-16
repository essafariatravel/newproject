import { describe, expect, it } from "vitest";
import { assertPreviewObservabilityTarget } from "../scripts/lib/preview-observability-target";

const valid = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  DATABASE_SCHEMA: "visa_os_preview",
  DATABASE_URL:
    "postgresql://postgres.xgetzgixalrsmuvfthpf:preview-only@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
} as NodeJS.ProcessEnv;

describe("Preview observability CLI target safety", () => {
  it("accepts only the dedicated preview schema on the expected project", () => {
    expect(assertPreviewObservabilityTarget({ ...valid })).toEqual({
      schema: "visa_os_preview",
      databaseHost: "aws-0-us-east-1.pooler.supabase.com",
    });
  });

  it("rejects Production semantics before inspecting a connection", () => {
    expect(() =>
      assertPreviewObservabilityTarget({
        ...valid,
        VERCEL_ENV: "production",
      }),
    ).toThrow(/Preview environment semantics/);
  });

  it("rejects a non-preview schema", () => {
    expect(() =>
      assertPreviewObservabilityTarget({
        ...valid,
        DATABASE_SCHEMA: "visa_os",
      }),
    ).toThrow(/visa_os_preview/);
  });

  it("rejects a remote database outside the recorded Supabase project", () => {
    expect(() =>
      assertPreviewObservabilityTarget({
        ...valid,
        DATABASE_URL:
          "postgresql://postgres.otherproject:preview-only@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
      }),
    ).toThrow(/project boundary mismatch|approved ESSAFARIA Supabase project/);
  });
});
