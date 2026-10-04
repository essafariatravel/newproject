import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applicants, applications, checklistItems, documentBlobs, documents } from "@/db/schema";
import { pool } from "@/lib/db";
import { createLegacyReconciliationService } from "@/lib/legacy-reconciliation";
import { ReconciliationWarning } from "@/components/reconciliation-warning";
import { createDraftApplication, getDecisionDocuments, recordApplicationDecision } from "@/lib/applications";
import { applyMigrations } from "../scripts/lib/migrations";
import { dependencyDeleteOrder } from "../scripts/lib/reset-plan";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(() => vi.unstubAllEnvs());
const bytes = Buffer.from("%PDF-1.4 synthetic official decision");
const file = { name: "decision.pdf", type: "application/pdf", size: bytes.length, data: bytes };

async function processing() {
  const actor = await userByEmail("admin@test.example"), owner = await userByEmail("a-admin@test.example");
  const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: owner.agencyId!, visaTypeId: visa.id, createdBy: actor });
  const state = (await db.execute(sql`select id from statuses where code='IN_PROCESS'`)).rows[0] as { id: string };
  await db.update(applications).set({ statusId: state.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
  return { app, actor };
}
async function decided() {
  const { app, actor } = await processing();
  const decision = await recordApplicationDecision({ applicationId: app.id, actor, outcome: "APPROVED", file });
  const [doc] = await db.select().from(documents).where(eq(documents.id, decision.documentId));
  return { app, actor, doc: doc! };
}

/** Corrupt historical rows are created before the permanent identity guard.
 * The full current migrations are then replayed, with no disabled triggers. */
async function historicalDecision(
  corrupt: (schema: string, doc: typeof documents.$inferSelect) => Promise<void>,
  verify: (details: { app: typeof applications.$inferSelect; actor: Awaited<ReturnType<typeof userByEmail>>; doc: typeof documents.$inferSelect;
    getDecisionDocuments: typeof getDecisionDocuments; warning: typeof ReconciliationWarning;
    reconciliation: ReturnType<typeof createLegacyReconciliationService> }) => Promise<void>,
) {
  const { app, actor, doc } = await decided();
  const schema = `presentation_fixture_${randomBytes(5).toString("hex")}`;
  const directory = await mkdtemp(path.join(os.tmpdir(), "essafaria-proof-history-"));
  try {
    const names = (await readdir("migrations")).filter(name => name.endsWith(".sql")).sort();
    for (const name of names.filter(name => name <= "0027_document_integrity.sql")) {
      await copyFile(path.join("migrations", name), path.join(directory, name));
    }
    await applyMigrations(pool, directory, schema);
    const tables = (await pool.query<{ name: string }>("select table_name name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE' and table_name<>'schema_migrations'", [schema])).rows.map(row => row.name);
    const edges = (await pool.query<{ child: string; parent: string }>(`select child.relname child,parent.relname parent from pg_constraint c
      join pg_class child on child.oid=c.conrelid join pg_class parent on parent.oid=c.confrelid
      join pg_namespace n on n.oid=child.relnamespace where c.contype='f' and n.nspname=$1`, [schema])).rows;
    await pool.query(`truncate ${tables.map(name => `"${schema}"."${name}"`).join(",")} restart identity cascade`);
    for (const name of dependencyDeleteOrder(tables, edges).reverse()) {
      const rows = (await pool.query<{ row: Record<string, unknown> }>(`select to_jsonb(t) row from "public"."${name}" t`)).rows.map(row => row.row);
      // A genuine decision is inserted through its nonterminal state so the
      // canonical final-decision trigger can verify it after documents exist.
      if (name === "applications") {
        const status = (await pool.query(`select id from "${schema}".statuses where code='IN_PROCESS'`)).rows[0].id;
        for (const row of rows) if (row.id === app.id) row.status_id = status;
      }
      if (rows.length) await pool.query(`insert into "${schema}"."${name}" select * from jsonb_populate_recordset(null::"${schema}"."${name}",$1::jsonb)`, [JSON.stringify(rows)]);
    }
    await pool.query(`update "${schema}".applications set status_id=(select id from "${schema}".statuses where code='APPROVED') where id=$1`, [app.id]);
    // Historical 0027 permits attaching the independent digest before 0028.
    await pool.query(`update "${schema}".documents set sha256=$1 where id=$2`, [createHash("sha256").update(bytes).digest("hex"), doc.id]);
    await corrupt(schema, doc);
    await applyMigrations(pool, path.join(process.cwd(), "migrations"), schema);
    vi.stubEnv("DATABASE_SCHEMA", schema);
    vi.resetModules();
    const isolated = await import("@/lib/applications");
    const warning = (await import("@/components/reconciliation-warning")).ReconciliationWarning;
    await verify({ app, actor, doc, getDecisionDocuments: isolated.getDecisionDocuments, warning, reconciliation: createLegacyReconciliationService(pool, schema) });
    const guards = (await pool.query(`select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and t.tgname in ('document_blobs_permanent_immutable','documents_file_identity_immutable') and t.tgenabled='O'`, [schema])).rows;
    expect(guards).toHaveLength(2);
  } finally {
    vi.unstubAllEnvs();vi.resetModules();
    await pool.query(`drop schema if exists "${schema}" cascade`);
    await rm(directory, { recursive: true, force: true });
  }
}

describe("official decision presentation uses verified canonical documents", () => {
  it("does not present a generic unfinished approval upload as an official decision", async () => {
    const { app, actor } = await processing();
    const type = (await db.execute(sql`select id from document_types where code='DECISION_VISA_APPROVAL'`)).rows[0] as { id: string };
    const key = `test-unfinished/${crypto.randomUUID()}`;
    await db.insert(documentBlobs).values({ key, data: bytes, mimeType: file.type, sizeBytes: bytes.length });
    await db.insert(documents).values({ applicationId: app.id, documentTypeId: type.id, originalFilename: file.name,
      storageKey: key, mimeType: file.type, sizeBytes: bytes.length, uploadedBy: actor.id, status: "UPLOADED" });
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("presents the genuine persisted file from the canonical decision workflow", async () => {
    const { app, doc } = await decided();
    expect(doc.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await getDecisionDocuments(app.id)).map(row => row.id)).toEqual([doc.id]);
  });

  it("preserves verified historical null-hash proof without weakening the current identity guards", async () => {
    await historicalDecision(async (schema, doc) => {
      await pool.query(`update "${schema}".documents set sha256=null where id=$1`, [doc.id]);
    }, async ({ app, actor, doc, getDecisionDocuments, warning, reconciliation }) => {
      expect((await getDecisionDocuments(app.id)).map(row => row.id)).toEqual([doc.id]);
      expect(await warning({ applicationId: app.id, user: actor, locale: "en" })).toBeNull();
      expect((await reconciliation.scan(actor)).detected).toBe(0);
    });
  });

  it("rejects permanent blob and document-identity rewriting while leaving genuine proof readable", async () => {
    const { app, doc } = await decided();
    const immutableCause = { cause: { code: "P0001", message: expect.stringMatching(/immutable/i) } };
    await expect(db.update(documentBlobs).set({ data: Buffer.from("damaged") }).where(eq(documentBlobs.key, doc.storageKey))).rejects.toMatchObject(immutableCause);
    await expect(db.update(documents).set({ mimeType: "image/jpeg" }).where(eq(documents.id, doc.id))).rejects.toMatchObject(immutableCause);
    await expect(db.update(documents).set({ sha256: "0".repeat(64) }).where(eq(documents.id, doc.id))).rejects.toMatchObject(immutableCause);
    expect((await getDecisionDocuments(app.id)).map(row => row.id)).toEqual([doc.id]);
  });

  it("does not present an accepted historical record without its reviewer as valid proof", async () => {
    const { app, doc } = await decided();
    await db.update(documents).set({ reviewedBy: null }).where(eq(documents.id, doc.id));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("does not present an accepted historical record without its uploader as valid proof", async () => {
    const { app, doc } = await decided();
    await db.update(documents).set({ uploadedBy: null }).where(eq(documents.id, doc.id));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("does not present an accepted record when its original stored bytes are missing", async () => {
    const { app, doc } = await decided();
    await db.delete(documentBlobs).where(eq(documentBlobs.key, doc.storageKey));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("does not present an accepted record when blob bytes disagree with the persisted size", async () => {
    await historicalDecision(async (schema, doc) => {
      await pool.query(`update "${schema}".document_blobs set data=$1 where key=$2`, [Buffer.from("damaged"), doc.storageKey]);
    }, async ({ app, getDecisionDocuments }) => { expect(await getDecisionDocuments(app.id)).toHaveLength(0); });
  });

  it("keeps an unverified storage provider out of the official-proof presentation", async () => {
    const { app } = await decided();
    vi.stubEnv("STORAGE_PROVIDER", "supabase");
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it.each(["review-time", "applicant-link", "checklist-link"] as const)("never certifies malformed %s proof as healthy in reconciliation or dossier warnings", async defect => {
    const { app, actor, doc } = await decided();
    if (defect === "review-time") await db.update(documents).set({ reviewedAt: null }).where(eq(documents.id, doc.id));
    if (defect === "applicant-link") {
      const [traveller] = await db.insert(applicants).values({applicationId:app.id,fullName:"Synthetic malformed proof",firstName:"Synthetic",lastName:"proof",nationality:"DZ"}).returning();
      await db.update(documents).set({applicantId:traveller!.id}).where(eq(documents.id,doc.id));
    }
    if (defect === "checklist-link") {
      const [slot] = await db.select().from(checklistItems).where(eq(checklistItems.applicationId,app.id));
      await db.update(documents).set({checklistItemId:slot!.id}).where(eq(documents.id,doc.id));
    }
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
    const reconciliation=createLegacyReconciliationService(pool);
    await reconciliation.scan(actor);
    const issue=(await reconciliation.list(actor)).find(issue=>issue.applicationId===app.id&&issue.kind==="MISSING_OFFICIAL_DECISION");
    expect(issue).toBeDefined();
    await expect(reconciliation.disposition(actor,{issueId:issue!.id,outcome:"RESTORED",note:"Synthetic malformed original remains unresolved."})).rejects.toMatchObject({code:"RECONCILIATION_UNRESOLVED"});
    expect(await ReconciliationWarning({applicationId:app.id,user:actor,locale:"en"})).not.toBeNull();
  });

  it.each(["blob-mime", "unsupported-mime", "corrupt-signature", "hash-mismatch-valid-signature"] as const)("never certifies historical %s proof after replaying permanent identity guards", async defect => {
    await historicalDecision(async (schema, doc) => {
      if (defect === "blob-mime") await pool.query(`update "${schema}".document_blobs set mime_type='image/jpeg' where key=$1`, [doc.storageKey]);
      if (defect === "unsupported-mime") {
        await pool.query(`update "${schema}".documents set mime_type='application/octet-stream' where id=$1`, [doc.id]);
        await pool.query(`update "${schema}".document_blobs set mime_type='application/octet-stream' where key=$1`, [doc.storageKey]);
      }
      if (defect === "corrupt-signature") await pool.query(`update "${schema}".document_blobs set data=$1 where key=$2`, [Buffer.alloc(doc.sizeBytes), doc.storageKey]);
      if (defect === "hash-mismatch-valid-signature") {
        const tampered = Buffer.from(bytes);tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
        expect(tampered.length).toBe(bytes.length);expect(tampered.subarray(0, 5).toString()).toBe("%PDF-");
        await pool.query(`update "${schema}".document_blobs set data=$1 where key=$2`, [tampered, doc.storageKey]);
      }
    }, async ({ app, actor, getDecisionDocuments, warning, reconciliation }) => {
      expect(await getDecisionDocuments(app.id)).toHaveLength(0);
      await reconciliation.scan(actor);
      const issue = (await reconciliation.list(actor)).find(issue => issue.applicationId === app.id && issue.kind === "MISSING_OFFICIAL_DECISION");
      expect(issue).toBeDefined();
      await expect(reconciliation.disposition(actor, { issueId: issue!.id, outcome: "RESTORED", note: "Synthetic corrupted historical original remains unresolved." })).rejects.toMatchObject({ code: "RECONCILIATION_UNRESOLVED" });
      expect(await warning({ applicationId: app.id, user: actor, locale: "en" })).not.toBeNull();
    });
  });
});
