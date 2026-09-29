import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { stageRequestUpload, resolveRequestUploads, clearRequestUploads } from "@/lib/request-uploads";
suiteSetup();

describe("bounded final-confirmation uploads", () => {
  it("isolates uploads by user and attempt, accepts 2 MB, expires and clears bytes without business drafts", async () => {
    const actor = await userByEmail("b-admin@test.example"), other = await userByEmail("a-admin@test.example");
    const config = (await db.execute(sql`select vr.visa_type_id as visa, vr.document_type_id as document from visa_requirements vr limit 1`)).rows[0] as { visa: string; document: string };
    const attempt = crypto.randomUUID();
    const input = { actor, attempt, visaTypeId: config.visa, documentTypeId: config.document, slot: 0,
      file: { name: "passport.pdf", type: "application/pdf", size: 2 * 1024 * 1024, data: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2 * 1024 * 1024 - 9, 1)]) } };
    const before = (await db.execute(sql`select count(*)::int as n from applications`)).rows[0];
    const token = await stageRequestUpload(input);
    expect((await resolveRequestUploads(actor, attempt, config.visa, [token]))[0]!.file.size).toBe(2 * 1024 * 1024);
    await expect(resolveRequestUploads(other, attempt, config.visa, [token])).rejects.toMatchObject({ code: "EMPTY_FILE" });
    await expect(resolveRequestUploads(actor, crypto.randomUUID(), config.visa, [token])).rejects.toMatchObject({ code: "EMPTY_FILE" });
    await expect(stageRequestUpload({ ...input, file: { ...input.file, data: Buffer.alloc(2 * 1024 * 1024 + 1) } })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect((await db.execute(sql`select count(*)::int as n from applications`)).rows[0]).toEqual(before);
    await db.execute(sql`update document_blobs set created_at = now() - interval '2 hours' where key like 'pending-request/%'`);
    await expect(resolveRequestUploads(actor, attempt, config.visa, [token])).rejects.toMatchObject({ code: "EMPTY_FILE" });
    await clearRequestUploads(actor, attempt);
    expect((await db.execute(sql`select count(*)::int as n from document_blobs where key like 'pending-request/%'`)).rows[0]).toEqual({ n: 0 });
  });
});
