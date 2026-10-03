import "./lib/load-env";
import { randomUUID } from "node:crypto";
import { pool } from "../src/lib/db";
import { storageProvider } from "../src/lib/storage";
import { assertSafePerfTarget, safeTargetSummary } from "./perf-safety";

function assertLiveAck() {
  if (process.env.PERF_ALLOW_LIVE_STORAGE !== "YES") {
    throw new Error("Set PERF_ALLOW_LIVE_STORAGE=YES only for the approved isolated non-Production storage run.");
  }
}

function twoMbPdf(seed: number): Buffer {
  const header = Buffer.from(`%PDF-1.4\n%PERF-${seed}\n`);
  return Buffer.concat([header, Buffer.alloc(2 * 1024 * 1024 - header.length, seed % 251)]);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function stats(values: number[]) {
  return {
    count: values.length,
    minMs: Math.min(...values),
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
    maxMs: Math.max(...values),
    avgMs: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, durationMs: performance.now() - started };
}

async function runCohort(concurrency: number, prefix: string, provider: ReturnType<typeof storageProvider>) {
  const keys = Array.from({ length: concurrency }, (_, index) =>
    `${prefix}/cohort-${concurrency}/${index}-${randomUUID()}.pdf`,
  );
  const payloads = keys.map((_, index) => twoMbPdf(index + concurrency));

  const puts = await Promise.all(keys.map((key, index) => timed(async () => {
    await provider.put(key, payloads[index]!, "application/pdf");
  })));

  const gets = await Promise.all(keys.map((key, index) => timed(async () => {
    const object = await provider.get(key);
    const expected = payloads[index]!;
    if (object.data.length !== expected.length || !object.data.equals(expected)) {
      throw new Error(`Storage byte mismatch for ${key}.`);
    }
    return object;
  })));

  return {
    keys,
    put: stats(puts.map((result) => result.durationMs)),
    get: stats(gets.map((result) => result.durationMs)),
  };
}

async function main() {
  const target = assertSafePerfTarget();
  assertLiveAck();
  const providerName = process.env.STORAGE_PROVIDER === "supabase" ? "supabase" : "db";
  const provider = storageProvider();
  const runId = randomUUID();
  const prefix = `perf-live/${runId}`;
  const allKeys: string[] = [];
  const results: unknown[] = [];

  try {
    for (const concurrency of [1, 5, 10, 20]) {
      const result = await runCohort(concurrency, prefix, provider);
      allKeys.push(...result.keys);
      results.push({ concurrency, put: result.put, get: result.get });
    }

    // Replacement/versioning is represented by a new opaque key, matching the
    // application model that preserves history rather than overwriting a prior object.
    const originalKey = `${prefix}/replacement/original-${randomUUID()}.pdf`;
    const replacementKey = `${prefix}/replacement/v2-${randomUUID()}.pdf`;
    const original = twoMbPdf(91);
    const replacement = twoMbPdf(92);
    await provider.put(originalKey, original, "application/pdf");
    await provider.put(replacementKey, replacement, "application/pdf");
    allKeys.push(originalKey, replacementKey);
    const originalRead = await provider.get(originalKey);
    const replacementRead = await provider.get(replacementKey);
    if (!originalRead.data.equals(original) || !replacementRead.data.equals(replacement)) {
      throw new Error("Replacement/version-history storage verification failed.");
    }

    // Use distinct semantic keys for receipt and decision-document storage paths.
    const receiptKey = `${prefix}/receipt/${randomUUID()}.pdf`;
    const decisionKey = `${prefix}/official-decision/${randomUUID()}.pdf`;
    const receipt = twoMbPdf(101);
    const decision = twoMbPdf(102);
    await provider.put(receiptKey, receipt, "application/pdf");
    await provider.put(decisionKey, decision, "application/pdf");
    allKeys.push(receiptKey, decisionKey);
    if (!(await provider.get(receiptKey)).data.equals(receipt)) throw new Error("Synthetic receipt read-back failed.");
    if (!(await provider.get(decisionKey)).data.equals(decision)) throw new Error("Synthetic decision-document read-back failed.");

    console.log(JSON.stringify({
      ok: true,
      target: safeTargetSummary(target),
      runId,
      provider: providerName,
      cohorts: results,
      replacementHistoryPreserved: true,
      syntheticReceiptRoundTrip: true,
      syntheticDecisionDocumentRoundTrip: true,
      maxFileBytes: 2 * 1024 * 1024,
      objectsCreated: allKeys.length,
    }, null, 2));
  } finally {
    const deletions = await Promise.allSettled(allKeys.map((key) => provider.delete(key)));
    const failed = deletions.filter((result) => result.status === "rejected").length;
    if (failed > 0) console.error(`Synthetic storage cleanup had ${failed} failed deletes.`);
    await pool.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live storage performance suite failed.");
  process.exit(1);
});
