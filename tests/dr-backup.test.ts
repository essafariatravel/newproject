import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessProductionBackupSource,
  backupKeyFromEnvironment,
  decryptFileAes256Gcm,
  encryptFileAes256Gcm,
  encryptedBackupOverheadBytes,
  pgEnvironmentFromUrl,
  sha256File,
  storageInventorySha256,
  verifyEncryptedFileAes256Gcm,
} from "../scripts/lib/dr-backup";
import { PRODUCTION_PROJECT_REF, PRODUCTION_SCHEMA } from "../scripts/lib/dr-safety";

function safeEnv(): Record<string, string> {
  return {
    DR_BACKUP_ENVIRONMENT: "PRODUCTION",
    DR_STORAGE_MODE: "DATABASE_BLOBS",
    DR_RELEASE_SHA: "53dc61de334c6412c1e5337b4f745c360f69facd",
    DATABASE_SCHEMA: PRODUCTION_SCHEMA,
    MIGRATION_DATABASE_URL:
      `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  };
}

describe("Production backup source guard", () => {
  it("accepts only the explicitly pinned Production project/schema/source", () => {
    expect(assessProductionBackupSource(safeEnv())).toMatchObject({ safe: true, findings: [] });
  });

  it("fails closed on wrong project, schema, storage mode or deployed runtime", () => {
    const wrong = {
      ...safeEnv(),
      DATABASE_SCHEMA: "visa_os_preview",
      DR_STORAGE_MODE: "EXTERNAL_OBJECTS",
      VERCEL: "1",
      MIGRATION_DATABASE_URL:
        "postgresql://postgres.ridoyedqgiavgcwnpubq:secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres",
    };
    const result = assessProductionBackupSource(wrong);
    expect(result.safe).toBe(false);
    expect(result.findings.join(" ")).toContain("visa_os");
    expect(result.findings.join(" ")).toContain("DATABASE_BLOBS");
    expect(result.findings.join(" ")).toContain("Vercel");
    expect(result.findings.join(" ")).toContain("approved ESSAFARIA Supabase project");
  });

  it("requires an exact release SHA instead of guessing the running code", () => {
    const env = safeEnv();
    delete env.DR_RELEASE_SHA;
    const result = assessProductionBackupSource(env);
    expect(result.safe).toBe(false);
    expect(result.findings.join(" ")).toContain("DR_RELEASE_SHA");
  });
});

describe("backup key and PostgreSQL child-process environment", () => {
  it("accepts exactly 32 random bytes and rejects weak/malformed key material", () => {
    const key = Buffer.alloc(32, 7);
    expect(backupKeyFromEnvironment(key.toString("base64"))).toEqual(key);
    expect(() => backupKeyFromEnvironment(Buffer.alloc(31, 7).toString("base64"))).toThrow("32 bytes");
    expect(() => backupKeyFromEnvironment(Buffer.alloc(32).toString("base64"))).toThrow("all-zero");
    expect(() => backupKeyFromEnvironment(undefined)).toThrow("required");
  });

  it("moves credentials to libpq variables and removes app/DR secrets from the child environment", () => {
    const env = pgEnvironmentFromUrl(
      `postgresql://postgres.${PRODUCTION_PROJECT_REF}:p%40ss@pooler.supabase.com:5432/postgres?sslmode=require`,
      {
        DATABASE_URL: "should-not-propagate",
        MIGRATION_DATABASE_URL: "should-not-propagate",
        DR_BACKUP_KEY_BASE64: "should-not-propagate",
        PATH: "/usr/bin",
      },
    );
    expect(env).toMatchObject({
      PGHOST: "pooler.supabase.com",
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: `postgres.${PRODUCTION_PROJECT_REF}`,
      PGPASSWORD: "p@ss",
      PGSSLMODE: "require",
      PATH: "/usr/bin",
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.MIGRATION_DATABASE_URL).toBeUndefined();
    expect(env.DR_BACKUP_KEY_BASE64).toBeUndefined();
  });
});

describe("DR encrypted archive", () => {
  it("round-trips arbitrary bytes with AES-256-GCM and stable SHA-256 evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "essafaria-dr-test-"));
    try {
      const source = path.join(dir, "source.dump");
      const encrypted = path.join(dir, "source.dump.enc");
      const restored = path.join(dir, "restored.dump");
      const data = Buffer.concat([
        Buffer.from("ESSAFARIA test backup\0", "utf8"),
        Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 251)),
      ]);
      const key = Buffer.alloc(32, 23);
      await writeFile(source, data);
      await encryptFileAes256Gcm(source, encrypted, key);
      await verifyEncryptedFileAes256Gcm(encrypted, key);
      await decryptFileAes256Gcm(encrypted, restored, key);

      expect(await readFile(restored)).toEqual(data);
      expect((await readFile(encrypted)).length).toBe(data.length + encryptedBackupOverheadBytes());
      expect(await sha256File(encrypted)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects ciphertext/authentication tampering instead of returning damaged data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "essafaria-dr-tamper-"));
    try {
      const source = path.join(dir, "source.dump");
      const encrypted = path.join(dir, "source.dump.enc");
      const output = path.join(dir, "output.dump");
      const key = Buffer.alloc(32, 31);
      await writeFile(source, Buffer.from("sensitive recovery bytes".repeat(50)));
      await encryptFileAes256Gcm(source, encrypted, key);
      const bytes = await readFile(encrypted);
      bytes[Math.floor(bytes.length / 2)]! ^= 0x01;
      await writeFile(encrypted, bytes);

      await expect(verifyEncryptedFileAes256Gcm(encrypted, key)).rejects.toThrow();
      await expect(decryptFileAes256Gcm(encrypted, output, key)).rejects.toThrow();
      await expect(readFile(output)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("makes storage inventory evidence deterministic regardless of row order", () => {
    const a = storageInventorySha256([
      { key: "b", sizeBytes: 2 },
      { key: "a", sizeBytes: 1 },
    ]);
    const b = storageInventorySha256([
      { key: "a", sizeBytes: 1 },
      { key: "b", sizeBytes: 2 },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(storageInventorySha256([{ key: "a", sizeBytes: 9 }])).not.toBe(a);
  });
});
