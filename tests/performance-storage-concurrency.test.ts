import { count, like } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { db } from "@/lib/db";
import { documentBlobs } from "@/db/schema";
import { storageProvider } from "@/lib/storage";

suiteSetup();

const prefixes: string[] = [];

afterEach(async () => {
  for (const prefix of prefixes.splice(0)) {
    await db.delete(documentBlobs).where(like(documentBlobs.key, `${prefix}%`));
  }
});

function twoMbPdf(): Buffer {
  const header = Buffer.from("%PDF-1.4\n");
  return Buffer.concat([header, Buffer.alloc(2 * 1024 * 1024 - header.length, 1)]);
}

describe("performance-gate storage concurrency", () => {
  it("persists and retrieves 20 concurrent 2 MB private objects without byte loss", async () => {
    const provider = storageProvider();
    const prefix = `perf-storage/${crypto.randomUUID()}/`;
    prefixes.push(prefix);
    const payload = twoMbPdf();
    const keys = Array.from({ length: 20 }, (_, index) => `${prefix}${index}.pdf`);

    await Promise.all(keys.map((key) => provider.put(key, payload, "application/pdf")));
    const stored = await Promise.all(keys.map((key) => provider.get(key)));

    expect(stored).toHaveLength(20);
    for (const object of stored) {
      expect(object.mimeType).toBe("application/pdf");
      expect(object.data.length).toBe(2 * 1024 * 1024);
      expect(object.data.subarray(0, 8).toString()).toBe("%PDF-1.4");
    }

    const rows = await db
      .select({ total: count() })
      .from(documentBlobs)
      .where(like(documentBlobs.key, `${prefix}%`));
    expect(Number(rows[0]?.total ?? 0)).toBe(20);

    await Promise.all(keys.map((key) => provider.delete(key)));
    const after = await db
      .select({ total: count() })
      .from(documentBlobs)
      .where(like(documentBlobs.key, `${prefix}%`));
    expect(Number(after[0]?.total ?? 0)).toBe(0);
    prefixes.pop();
  }, 120_000);
});
