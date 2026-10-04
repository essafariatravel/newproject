import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, copyFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../scripts/lib/migrations";
import { hashPassword } from "@/lib/crypto";
import type { AuthUser } from "@/lib/types";
import { createLegacyReconciliationService } from "@/lib/legacy-reconciliation";

const pool = new Pool({ connectionString: "postgresql://postgres:postgres@localhost:5434/essafaria_test" });
const schema = `legacy_fixture_${randomBytes(4).toString("hex")}`;
const adminId = "be000000-0000-4000-8000-000000000001";
const agencyId = "be000000-0000-4000-8000-000000000002";
const appId = "be000000-0000-4000-8000-000000000003";
const missingDocumentId = "be000000-0000-4000-8000-000000000004";
const actor: AuthUser = { id: adminId, email: "admin@synthetic.example", name: "Synthetic Admin", role: "SUPER_ADMIN",
  agencyId: null, userStatus: "ACTIVE", agencyStatus: null, agencyName: null };
const service = createLegacyReconciliationService(pool, schema);
let migrationDirectory: string;

describe("additive auditable legacy document reconciliation", () => {
  it("repairs an early event-sequence checkpoint idempotently without rewriting immutable history",async()=>{
    const fixture=`event_repair_${randomBytes(4).toString("hex")}`;
    const client=await pool.connect();
    try {
      await client.query(`create schema "${fixture}"`);
      await client.query(`create table "${fixture}".legacy_reconciliation_events(id integer primary key,note text,created_at timestamptz not null)`);
      await client.query(`insert into "${fixture}".legacy_reconciliation_events values(1,'Original historical event',now()),(2,'Second historical event',now()-interval '1 hour')`);
      await client.query(`create function "${fixture}".immutable_event() returns trigger language plpgsql as $$ begin raise exception 'Immutable history'; end; $$`);
      await client.query(`create trigger immutable_event before update or delete on "${fixture}".legacy_reconciliation_events for each row execute function "${fixture}".immutable_event()`);
      const before=(await client.query(`select id,note,created_at from "${fixture}".legacy_reconciliation_events order by id`)).rows;
      await client.query("begin");await client.query(`set local search_path to "${fixture}"`);
      await client.query(await readFile("migrations/0031_reconciliation_event_sequence_repair.sql","utf8"));await client.query("commit");
      await client.query("begin");await client.query(`set local search_path to "${fixture}"`);
      await client.query(await readFile("migrations/0031_reconciliation_event_sequence_repair.sql","utf8"));await client.query("commit");
      expect((await client.query(`select id,note,created_at from "${fixture}".legacy_reconciliation_events order by id`)).rows).toEqual(before);
      expect((await client.query(`select count(distinct event_sequence)::int n from "${fixture}".legacy_reconciliation_events`)).rows[0].n).toBe(2);
      expect((await client.query("select count(*)::int n from pg_sequences where schemaname=$1", [fixture])).rows[0].n).toBe(1);
      await expect(client.query(`update "${fixture}".legacy_reconciliation_events set note='Edited' where id=1`)).rejects.toThrow(/Immutable/);
      await expect(client.query(`delete from "${fixture}".legacy_reconciliation_events where id=1`)).rejects.toThrow(/Immutable/);
    }finally{await client.query("rollback");await client.query(`drop schema if exists "${fixture}" cascade`);client.release();}
  });
  beforeAll(async () => {
    migrationDirectory = await mkdtemp(path.join(os.tmpdir(), "essafaria-legacy-migrations-"));
    const names = (await readdir("migrations")).filter(f => f.endsWith(".sql")).sort();
    for (const name of names.filter(f => f <= "0020_identity_security.sql")) await copyFile(path.join("migrations", name), path.join(migrationDirectory, name));
    await applyMigrations(pool, migrationDirectory, schema);
    await pool.query(`insert into "${schema}".users(id,email,password_hash,name,role) values($1,'admin@synthetic.example',$2,'Synthetic Admin','SUPER_ADMIN')`, [adminId, await hashPassword("Synthetic-Admin-123")]);
    await pool.query(`insert into "${schema}".agencies(id,legal_name,email,currency) values($1,'Synthetic Agency','agency@synthetic.example','DZD')`, [agencyId]);
    await pool.query(`insert into "${schema}".countries(name,iso2) values('France','FR')`);
    await pool.query(`insert into "${schema}".visa_categories(name,code) values('Tourist','TOURIST')`);
    await pool.query(`insert into "${schema}".visa_types(country_id,category_id,name,code,fee,currency,processing_min_days,processing_max_days)
      select c.id,v.id,'Legacy Visa','LEGACY',100,'DZD',1,3 from "${schema}".countries c cross join "${schema}".visa_categories v`);
    await pool.query(`insert into "${schema}".priorities(code,name,weight) values('STANDARD','Standard',0)`);
    await pool.query(`insert into "${schema}".document_types(code,name) values('PASSPORT','Passport') on conflict do nothing`);
    await pool.query(`insert into "${schema}".applications(id,reference,agency_id,created_by,status_id,country_id,visa_type_id,priority_id,
      country_name,visa_type_name,visa_type_code,category_name,currency,fee,processing_min_days,processing_max_days,decision_at)
      select $1,'LEGACY-SYNTHETIC-001',$2,$3,s.id,c.id,v.id,p.id,'France','Legacy Visa','LEGACY','Tourist','DZD',100,1,3,now()
      from "${schema}".statuses s cross join "${schema}".countries c cross join "${schema}".visa_types v cross join "${schema}".priorities p where s.code='APPROVED'`, [appId, agencyId, adminId]);
    await pool.query(`insert into "${schema}".documents(id,application_id,document_type_id,original_filename,mime_type,size_bytes,storage_key,status,uploaded_by)
      select $1,$2,id,'genuine-original-not-available.pdf','application/pdf',3,'legacy/missing-original.pdf','ACCEPTED',$3
      from "${schema}".document_types where code='PASSPORT' limit 1`, [missingDocumentId, appId, adminId]);
    // Attach historical digest evidence before permanent identity guards exist.
    for (const name of names.filter(f => f > "0020_identity_security.sql" && f <= "0027_document_integrity.sql")) await copyFile(path.join("migrations", name), path.join(migrationDirectory, name));
    await applyMigrations(pool, migrationDirectory, schema);
    await pool.query(`update "${schema}".documents set sha256=$1 where id=$2`, [createHash("sha256").update("abc").digest("hex"), missingDocumentId]);
    // Migration-based legacy fixture, never disable a canonical decision or immutable trigger.
    await applyMigrations(pool, path.join(process.cwd(), "migrations"), schema);
  });
  afterAll(async () => {
    await pool.query(`drop schema if exists "${schema}" cascade`);
    await pool.end();
    if (migrationDirectory) await rm(migrationDirectory, { recursive: true, force: true });
  });

  it("detects the exact legacy missing official decision and missing blob without changing historical status or documents", async () => {
    const before = (await pool.query(`select to_jsonb(t) row from "${schema}".applications t`)).rows;
    const result = await service.scan(actor);
    expect(result.detected).toBe(2);
    const issues = await service.list(actor);
    expect(issues.map(r => r.kind).sort()).toEqual(["MISSING_OFFICIAL_DECISION", "MISSING_STORAGE_OBJECT"]);
    expect(issues.every(r => r.status === "OPEN" && r.applicationId === appId)).toBe(true);
    expect((await pool.query(`select to_jsonb(t) row from "${schema}".applications t`)).rows).toEqual(before);
    expect((await pool.query(`select count(*)::int n from "${schema}".documents`)).rows[0].n).toBe(1);
    expect((await pool.query(`select count(*)::int n from "${schema}".document_blobs`)).rows[0].n).toBe(0);
    const audit = (await pool.query(`select action,actor_id,metadata from "${schema}".audit_logs where action='LEGACY_RECONCILIATION_DETECTED'`)).rows;
    expect(audit).toHaveLength(2);
    expect(audit.every(r => r.actor_id === adminId && r.metadata.applicationId === appId)).toBe(true);
  });

  it("rescans idempotently and does not erase historical findings", async () => {
    expect((await service.scan(actor)).detected).toBe(0);
    expect(await service.list(actor)).toHaveLength(2);
    expect((await pool.query(`select count(*)::int n from "${schema}".legacy_reconciliation_events where outcome='DETECTED'`)).rows[0].n).toBe(2);
  });

  it("records owner disposition as unresolved and refuses restoration while genuine originals are missing", async () => {
    const issue = (await service.list(actor)).find(r => r.kind === "MISSING_OFFICIAL_DECISION")!;
    await service.disposition(actor, { issueId: issue.id, outcome: "OWNER_DISPOSITION", note: "Owner requires the genuine original embassy decision before release." });
    expect((await service.list(actor)).find(r => r.id === issue.id)).toMatchObject({ status: "OPEN", lastOutcome: "OWNER_DISPOSITION" });
    await expect(service.disposition(actor, { issueId: issue.id, outcome: "RESTORED", note: "Original is still missing, this must never be accepted." })).rejects.toMatchObject({ code: "RECONCILIATION_UNRESOLVED" });
    expect((await pool.query(`select count(*)::int n from "${schema}".legacy_reconciliation_events where outcome='RESTORED'`)).rows[0].n).toBe(0);
  });

  it("marks restored only after the real blob is present, retains immutable finding and audit, and reopens a lost restored object", async () => {
    const issue = (await service.list(actor)).find(r => r.kind === "MISSING_STORAGE_OBJECT")!;
    await pool.query(`insert into "${schema}".document_blobs(key,mime_type,size_bytes,data) values('legacy/missing-original.pdf','application/pdf',3,$1)`, [Buffer.from("abc")]);
    await service.disposition(actor, { issueId: issue.id, outcome: "RESTORED", note: "Genuine original restored by the authorized records owner." });
    expect((await service.list(actor)).find(r => r.id === issue.id)).toMatchObject({ status: "RESTORED", lastOutcome: "RESTORED" });
    await expect(pool.query(`delete from "${schema}".legacy_reconciliation_issues where id=$1`, [issue.id])).rejects.toThrow(/Immutable/);
    await pool.query(`delete from "${schema}".document_blobs where key='legacy/missing-original.pdf'`);
    await service.scan(actor);
    expect((await service.list(actor)).find(r => r.id === issue.id)).toMatchObject({ status: "OPEN", lastOutcome: "DETECTED" });
  });

  it("denies agency actors and rechecks suspended/reclassified staff before recording any finding or disposition", async () => {
    await expect(service.scan({ ...actor, role: "AGENCY_ADMIN", agencyId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.list({ ...actor, role: "AGENCY_USER", agencyId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.query(`update "${schema}".users set status='SUSPENDED' where id=$1`, [adminId]);
    const before = (await pool.query(`select count(*)::int n from "${schema}".legacy_reconciliation_events`)).rows[0].n;
    await expect(service.scan(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query(`select count(*)::int n from "${schema}".legacy_reconciliation_events`)).rows[0].n).toBe(before);
    await pool.query(`update "${schema}".users set status='ACTIVE' where id=$1`, [adminId]);
  });
  it("refuses pending activation and unsupported storage instead of certifying healthy records",async()=>{
    const secondId="be000000-0000-4000-8000-000000000009";
    await pool.query(`insert into "${schema}".users(id,email,password_hash,name,role) values($1,'second@synthetic.example',$2,'Second Admin','SUPER_ADMIN')`,[secondId,await hashPassword("Synthetic-Second-123")]);
    await pool.query(`update "${schema}".users set activation_pending=true where id=$1`,[adminId]);
    await expect(service.scan(actor)).rejects.toMatchObject({code:"FORBIDDEN"});
    await pool.query(`update "${schema}".users set activation_pending=false where id=$1`,[adminId]);
    const previous=process.env.STORAGE_PROVIDER;process.env.STORAGE_PROVIDER="supabase";
    try{await expect(service.scan(actor)).rejects.toMatchObject({code:"RECONCILIATION_STORAGE_UNVERIFIED"});}
    finally{if(previous===undefined)delete process.env.STORAGE_PROVIDER;else process.env.STORAGE_PROVIDER=previous;}
  });
  it("rechecks a suspension after waiting for the reconciliation lock",async()=>{
    const blocker=await pool.connect();await blocker.query("begin");
    await blocker.query("select pg_advisory_xact_lock(hashtext($1))",[schema+":legacy-reconciliation"]);
    const scanning=service.scan(actor).then(()=>"unexpected success",e=>e.code);
    try{
      await pool.query(`update "${schema}".users set status='SUSPENDED' where id=$1`,[adminId]);
      await blocker.query("commit");expect(await scanning).toBe("FORBIDDEN");
    }finally{await blocker.query("rollback");blocker.release();await pool.query(`update "${schema}".users set status='ACTIVE' where id=$1`,[adminId]);}
  });
  it("orders dispositions by immutable event sequence despite reversed event timestamps",async()=>{
    const issue=(await service.list(actor)).find(i=>i.kind==="MISSING_STORAGE_OBJECT")!;
    // Synthetic historical timing fixture: a transaction can start earlier and append later.
    await pool.query(`insert into "${schema}".legacy_reconciliation_events(issue_id,outcome,actor_id,note,created_at)
      values($1,'RESTORED',$2,'Synthetic prior event with a later transaction timestamp',now()+interval '1 hour')`,[issue.id,adminId]);
    await pool.query(`insert into "${schema}".legacy_reconciliation_events(issue_id,outcome,actor_id,note,created_at)
      values($1,'DETECTED',$2,'Original object lost again; latest appended event must remain OPEN',now()-interval '1 hour')`,[issue.id,adminId]);
    expect((await service.list(actor)).find(i=>i.id===issue.id)).toMatchObject({status:"OPEN",lastOutcome:"DETECTED"});
  });
  it("rejects a captured reconciliation identity after credential generation changes",async()=>{
    const version=(await pool.query(`select credential_version from "${schema}".users where id=$1`,[adminId])).rows[0].credential_version;
    const captured={...actor,credentialVersion:version};
    await pool.query(`update "${schema}".users set credential_version=credential_version+1 where id=$1`,[adminId]);
    await expect(service.scan(captured)).rejects.toMatchObject({code:"FORBIDDEN"});
  });

  it("refuses equal-length blob corruption as restoration of a fingerprinted historical original", async () => {
    const issue = (await service.list(actor)).find(row => row.kind === "MISSING_STORAGE_OBJECT")!;
    await pool.query(`insert into "${schema}".document_blobs(key,mime_type,size_bytes,data) values('legacy/missing-original.pdf','application/pdf',3,$1)`, [Buffer.from("abd")]);
    try {
      await expect(service.disposition(actor, { issueId: issue.id, outcome: "RESTORED", note: "Synthetic original has equal size but its bytes disagree with the independent fingerprint." })).rejects.toMatchObject({ code: "RECONCILIATION_UNRESOLVED" });
      await service.scan(actor);
      expect((await service.list(actor)).find(row => row.id === issue.id)).toMatchObject({ status: "OPEN" });
    } finally { await pool.query(`delete from "${schema}".document_blobs where key='legacy/missing-original.pdf'`); }
  });
});
