import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { expect, it } from "vitest";
import { encryptStreamAes256Gcm, decryptFileAes256Gcm } from "../scripts/lib/dr-backup";
import { exportEncryptedSnapshot, readEncryptedArchive } from "../scripts/lib/dr-export";

it("encrypts an archive stream without a plaintext artifact and refuses overwriting evidence", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dr-stream-test-"));
  try {
    const encrypted = path.join(dir, "archive.enc"), restored = path.join(dir, "synthetic-clear");
    const key = randomBytes(32), input = Buffer.from("PGDMP-synthetic-only\0".repeat(100));
    await encryptStreamAes256Gcm(Readable.from([input]), encrypted, key);
    expect(await readdir(dir)).toEqual(["archive.enc"]);
    const prior = await readFile(encrypted);
    await expect(encryptStreamAes256Gcm(Readable.from([input]), encrypted, key)).rejects.toThrow();
    expect(await readFile(encrypted)).toEqual(prior);
    await decryptFileAes256Gcm(encrypted, restored, key);
    expect(await readFile(restored)).toEqual(input);
    key.fill(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("removes partial ciphertext on dump failure and never accepts a broken archive producer", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dr-child-test-"));
  try {
    const producer = path.join(dir, "producer.cjs"), output = path.join(dir, "archive.enc");
    await writeFile(producer, "process.stdout.write('PGDMP-incomplete');process.exitCode=7;");
    await expect(exportEncryptedSnapshot({ binary: process.execPath, prefixArgs: [producer], schema: "visa_os", snapshot: "00000001-00000001-1", env: { NODE_ENV: "test" }, output, key: randomBytes(32) })).rejects.toThrow("pg_dump");
    await expect(readFile(output)).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("authenticates ciphertext before starting any restore consumer", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dr-consumer-test-"));
  try {
    const key = randomBytes(32), output = path.join(dir, "archive.enc"), marker = path.join(dir, "started");
    await encryptStreamAes256Gcm(Readable.from([Buffer.from("PGDMP-fixture")]), output, key);
    const bytes = await readFile(output); bytes[bytes.length - 1]! ^= 1; await writeFile(output, bytes);
    await expect(readEncryptedArchive({ binary: process.execPath, args: ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`], env: { NODE_ENV: "test" }, artifact: output, key })).rejects.toThrow();
    await expect(readFile(marker)).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("wires the operator backup and restore commands to streams and full snapshot checks",async()=>{
  const backup=await readFile('scripts/dr-create-backup.ts','utf8'),restore=await readFile('scripts/dr-restore.ts','utf8');
  expect(backup).toContain('qualifyRecoveryExportSession');expect(backup).toContain('exportEncryptedSnapshot');expect(backup).toContain('captureRecoverySnapshot');
  expect(backup).not.toMatch(/rawDump|--no-acl|encryptFileAes256Gcm/);
  expect(restore).toContain('readEncryptedArchive');expect(restore).toContain('compareRecoverySnapshots');expect(restore).not.toMatch(/rawDump|--no-acl|decryptFileAes256Gcm/);
});
