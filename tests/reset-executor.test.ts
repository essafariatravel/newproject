import { spawn, spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../scripts/lib/migrations";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { dependencyDeleteOrder } from "../scripts/lib/reset-plan";
import { resetCliNodePath, resetCliPath } from "./helpers/reset-cli";

const url = "postgresql://postgres:postgres@localhost:5434/essafaria_test";
const adminId = "ad000000-0000-4000-8000-000000000001";
const testId = "ad000000-0000-4000-8000-000000000002";
const agencyId = "ad000000-0000-4000-8000-000000000003";
const legalId = "ad000000-0000-4000-8000-000000000004";
const catalogueIds = {
  country: "ca000000-0000-4000-8000-000000000001", testCountry: "ca000000-0000-4000-8000-000000000002",
  category: "ca000000-0000-4000-8000-000000000003", testCategory: "ca000000-0000-4000-8000-000000000004",
  visa: "ca000000-0000-4000-8000-000000000005", testVisa: "ca000000-0000-4000-8000-000000000006",
  requirement: "ca000000-0000-4000-8000-000000000007", testRequirement: "ca000000-0000-4000-8000-000000000008",
};
const key = randomBytes(32);
const pool = new Pool({ connectionString: url });
const schemas: string[] = [];
let directory: string;

function invoke(schema: string, args: string[], overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [resetCliPath, ...args], {
    cwd: process.cwd(), encoding: "utf8", timeout: 60_000,
    env: { ...process.env, NODE_PATH: resetCliNodePath, NODE_ENV: "test", DATABASE_URL: url, DATABASE_SCHEMA: schema,
      STORAGE_PROVIDER: "db", RESET_BACKUP_KEY: key.toString("base64"), VERCEL: "", VERCEL_ENV: "", ...overrides },
  });
}

async function backupSequences(schema: string) {
  const rows = (await pool.query(`select s.sequencename as name,s.data_type::text as "dataType",s.start_value::text as "startValue",
    s.min_value::text as "minValue",s.max_value::text as "maxValue",s.increment_by::text as "incrementBy",s.cycle,s.cache_size::text as "cacheSize",
    parent.relname as "ownerTable",a.attname as "ownerColumn" from pg_sequences s join pg_namespace n on n.nspname=s.schemaname
    join pg_class seq on seq.relnamespace=n.oid and seq.relname=s.sequencename
    left join pg_depend dep on dep.objid=seq.oid and dep.classid='pg_class'::regclass and dep.deptype in ('a','i')
    left join pg_class parent on parent.oid=dep.refobjid and dep.refclassid='pg_class'::regclass
    left join pg_attribute a on a.attrelid=parent.oid and a.attnum=dep.refobjsubid where s.schemaname=$1 order by s.sequencename`, [schema])).rows;
  for (const row of rows) Object.assign(row, (await pool.query(`select last_value::text as "lastValue",is_called as "isCalled" from "${schema}"."${row.name}"`)).rows[0]);
  return rows;
}

// All schemas here are disposable synthetic fixtures; no application test tables are reset.
async function fixture(label: string, changeBeforeBackup?: (schema: string) => Promise<unknown>, changeRestoreBeforeCopy?: (schema: string) => Promise<unknown>) {
  const suffix = `${label}_${randomBytes(3).toString("hex")}`;
  const source = `reset_fixture_${suffix}`, restored = `reset_restored_${suffix}`, archive = `reset_archive_${suffix}`;
  schemas.push(source, restored, archive);
  await applyMigrations(pool, path.join(process.cwd(), "migrations"), source);
  await pool.query(`insert into "${source}".users(id,email,password_hash,name,role,status) values
    ($1,'approved-admin@synthetic.example',$3,'Approved real identity','SUPER_ADMIN','ACTIVE'),
    ($2,'test-staff@synthetic.example',$3,'Unapproved synthetic identity','VISA_AGENT','ACTIVE')`, [adminId, testId, await hashPassword("Synthetic-Admin-123")]);
  await pool.query(`insert into "${source}".agencies(id,legal_name,email,currency) values($1,'Synthetic test agency','test@synthetic.example','DZD')`, [agencyId]);
  await pool.query(`insert into "${source}".wallet_transactions(agency_id,type,amount,currency,balance_before,balance_after,reason,actor_id)
    values($1,'CREDIT',100,'DZD',0,100,'Synthetic immutable history',$2)`, [agencyId, adminId]);
  await pool.query(`insert into "${source}".audit_logs(actor_id,action,entity,entity_id) values($1,'SYNTHETIC_SEEDED','agency',$2)`, [adminId, agencyId]);
  // Synthetic preservation evidence only, never owner-approved product copy.
  await pool.query(`insert into "${source}".legal_versions(id,kind,locale,version,body,published_at,effective_at,author_id)
    values($1,'terms','en',1,'Synthetic legal preservation fixture, never owner-approved content.',now(),now()-interval '1 month',$2)`, [legalId, adminId]);
  await pool.query(`insert into "${source}".priorities(code,name,weight) values('STANDARD','Standard',0) on conflict do nothing`);
  await pool.query(`insert into "${source}".currencies(code,name,symbol) values('DZD','Algerian Dinar','DZD') on conflict do nothing`);
  await pool.query(`insert into "${source}".document_blobs(key,mime_type,size_bytes,data) values('synthetic/remove.pdf','application/pdf',3,$1),('brand/retained.png','image/png',3,$1)`, [Buffer.from("abc")]);
  await pool.query(`insert into "${source}".countries(id,name,iso2) values($1,'Approved launch destination','FR'),($2,'Classified test destination','JP')`, [catalogueIds.country, catalogueIds.testCountry]);
  await pool.query(`insert into "${source}".visa_categories(id,name,code) values($1,'Approved category','LAUNCH'),($2,'Classified test category','TEST')`, [catalogueIds.category, catalogueIds.testCategory]);
  await pool.query(`insert into "${source}".visa_types(id,country_id,category_id,name,code,currency) values($1,$2,$3,'Approved product','LAUNCH','DZD'),($4,$5,$6,'Classified test product','TEST','DZD')`,
    [catalogueIds.visa, catalogueIds.country, catalogueIds.category, catalogueIds.testVisa, catalogueIds.testCountry, catalogueIds.testCategory]);
  await pool.query(`insert into "${source}".document_types(name,code) values('Passport','PASSPORT') on conflict do nothing`);
  await pool.query(`insert into "${source}".visa_requirements(id,visa_type_id,document_type_id)
    select $1::uuid,$2::uuid,id from "${source}".document_types where code='PASSPORT'
    union all select $3::uuid,$4::uuid,id from "${source}".document_types where code='PASSPORT'`, [catalogueIds.requirement, catalogueIds.visa, catalogueIds.testRequirement, catalogueIds.testVisa]);
  if (changeBeforeBackup) await changeBeforeBackup(source);
  await applyMigrations(pool, path.join(process.cwd(), "migrations"), restored);
  if (changeRestoreBeforeCopy) await changeRestoreBeforeCopy(restored);
  const tables = (await pool.query("select table_name as name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE' order by table_name", [source])).rows.map(r => String(r.name));
  const edges = (await pool.query(`select child.relname child,parent.relname parent from pg_constraint c join pg_class child on child.oid=c.conrelid
    join pg_class parent on parent.oid=c.confrelid join pg_namespace n on n.oid=child.relnamespace where c.contype='f' and n.nspname=$1`, [source])).rows;
  await pool.query(`truncate ${tables.map(t => `"${restored}"."${t}"`).join(",")} restart identity cascade`);
  for (const table of dependencyDeleteOrder(tables, edges).reverse()) await pool.query(`insert into "${restored}"."${table}" select * from "${source}"."${table}"`);
  const sequences = await backupSequences(source);
  for (const sequence of sequences) await pool.query("select setval($1::regclass,$2::bigint,$3)", [`${restored}.${sequence.name}`, sequence.lastValue, sequence.isCalled]);
  // The real planner produces only non-secret digests needed by an operator manifest.
  const dry = invoke(source, ["--dry-run", "--preserve-user", adminId]);
  expect(dry.status, dry.stderr).toBe(0);
  const plan = JSON.parse(dry.stdout);
  const tableRows: Record<string, unknown[]> = {};
  for (const table of tables) tableRows[table] = (await pool.query(`select to_jsonb(t) row from "${source}"."${table}" t order by to_jsonb(t)::text`)).rows.map(r => r.row);
  const migrationNames = (await readdir("migrations")).filter(f => f.endsWith(".sql")).sort();
  const migrationBytes = await Promise.all(migrationNames.map(async name => ({ name, sql: await readFile(path.join("migrations", name), "utf8") })));
  const target = { database: "essafaria_test", schema: source, host: "127.0.0.1", port: 5434 };
  const payload = Buffer.from(JSON.stringify({ version: 1, target, tableRows, sequences, inventorySha256: plan.inventorySha256,
    definitionSha256: plan.definitionSha256, migrations: migrationBytes }));
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const encrypted = Buffer.from(JSON.stringify({ version: 1, algorithm: "AES-256-GCM", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }));
  const backup = path.join(directory, `${suffix}.enc`);
  await writeFile(backup, encrypted);
  const classifications = Object.fromEntries(tables.map(t => [t, ["schema_migrations","site_settings","legal_versions","statuses","status_transitions","document_types","priorities","currencies","countries","visa_categories","visa_types","visa_requirements"].includes(t) ? "PRESERVE_ALL" : "REMOVE_OPERATIONAL"]));
  const manifest = {
    version: 1, target, archiveSchema: archive, authorizedBy: adminId, preservedUserIds: [adminId],
    inventorySha256: plan.inventorySha256, definitionSha256: plan.definitionSha256,
    backup: { path: backup, sha256: createHash("sha256").update(encrypted).digest("hex"), algorithm: "AES-256-GCM",
      createdAt: new Date().toISOString(), verifiedRestoreAt: new Date().toISOString(), restoreSchema: restored },
    tableClassifications: classifications,
    storage: { provider: "db", removeKeys: ["synthetic/remove.pdf"], preserveKeys: ["brand/retained.png"] },
    authorization: { purpose: "DISPOSABLE_SYNTHETIC_LOCAL_RESET", archiveImmutableHistory: true, recreateOperationalSchema: true,
      configurationReviewed: true, exclusiveMaintenance: true },
  };
  const manifestPath = path.join(directory, `${suffix}.json`);
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { source, restored, archive, manifest, manifestPath, backup, beforeWallet: tableRows.wallet_transactions, beforeAudit: tableRows.audit_logs, beforeLegal: tableRows.legal_versions };
}

describe("guarded executable cleanup on synthetic localhost data", () => {
  beforeAll(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "essafaria-reset-test-")); });
  afterAll(async () => {
    for (const schema of schemas) await pool.query(`drop schema if exists "${schema}" cascade`);
    await pool.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("defaults to dry-run and describes the actual archive/recreate/storage effects without mutation", async () => {
    const f = await fixture("dry");
    const result = invoke(f.source, ["--approval-manifest", f.manifestPath]);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ mode: "DRY_RUN_READ_ONLY", executionAvailable: true, backupStatus: "BYTES_AUTHENTICATED_RESTORE_VERIFIED",
      effects: { archiveImmutableHistory: true, recreateOperationalSchema: true, removeDatabaseBlobs: 1, preserveDatabaseBlobs: 1 } });
    expect((await pool.query(`select count(*)::int n from "${f.source}".wallet_transactions`)).rows[0].n).toBe(1);
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
    if (process.env.ESSAFARIA_RESET_EVIDENCE_PATH) await writeFile(process.env.ESSAFARIA_RESET_EVIDENCE_PATH,
      JSON.stringify({ scope: "DISPOSABLE LOCAL SYNTHETIC FIXTURES ONLY", dryRun: report, dryRunDidNotMutate: true }, null, 2));
  });

  it("executes the real transaction, preserves immutable archive bytes and admin credentials, and reports actual post-zero counts", async () => {
    const f = await fixture("execute");
    const result = invoke(f.source, ["--execute", "--approval-manifest", f.manifestPath]);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ mode: "EXECUTED_LOCAL_SYNTHETIC", verified: true, afterCounts: { agencies: 0, applications: 0, documents: 0,
      wallet_transactions: 0, application_price_adjustments: 0, sessions: 0, users: 1, document_blobs: 1 }, preservedActiveSuperAdmins: 1 });
    expect((await pool.query(`select to_jsonb(t) row from "${f.archive}".wallet_transactions t`)).rows.map(r => r.row)).toEqual(f.beforeWallet);
    expect((await pool.query(`select to_jsonb(t) row from "${f.archive}".audit_logs t`)).rows.map(r => r.row)).toEqual(f.beforeAudit);
    expect((await pool.query(`select to_jsonb(t) row from "${f.source}".legal_versions t order by to_jsonb(t)::text`)).rows.map(r => r.row)).toEqual(f.beforeLegal);
    const legal = (await pool.query(`select id,effective_at,published_at,author_id from "${f.source}".legal_versions`)).rows[0];
    expect(legal).toMatchObject({ id: legalId, author_id: adminId });
    expect(legal.effective_at.getTime()).toBeLessThan(legal.published_at.getTime());
    await expect(pool.query(`update "${f.source}".legal_versions set body='Changed' where id=$1`, [legalId])).rejects.toThrow(/Immutable/);
    const user = (await pool.query(`select id,email,password_hash,status,role from "${f.source}".users`)).rows[0];
    expect(user).toMatchObject({ id: adminId, email: "approved-admin@synthetic.example", status: "ACTIVE", role: "SUPER_ADMIN" });
    expect(await verifyPassword("Synthetic-Admin-123", user.password_hash)).toBe(true);
    expect((await pool.query(`select key from "${f.source}".document_blobs`)).rows).toEqual([{ key: "brand/retained.png" }]);
    await expect(pool.query(`delete from "${f.archive}".wallet_transactions`)).rejects.toThrow(/immutable/);
    await expect(pool.query(`insert into "${f.source}".sessions(user_id,token_hash,expires_at) values($1,'invalid',now())`, [testId])).rejects.toThrow(/foreign key/);
    const constraints = (await pool.query("select count(*)::int n from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname=$1 and c.contype='f'", [f.source])).rows[0].n;
    expect(constraints).toBeGreaterThan(30);
    const triggers = (await pool.query(`select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and not t.tgisinternal`, [f.source])).rows.map(r => r.tgname);
    expect(triggers).toContain("applications_official_final_decision");
    expect(triggers).toContain("wallet_transactions_immutable");
    if (process.env.ESSAFARIA_RESET_EVIDENCE_PATH) {
      const evidence = JSON.parse(await readFile(process.env.ESSAFARIA_RESET_EVIDENCE_PATH, "utf8"));
      await writeFile(process.env.ESSAFARIA_RESET_EVIDENCE_PATH, JSON.stringify({ ...evidence, syntheticExecution: report,
        preservationVerified: { originalLedgerAndAuditArchived: true, legalUuidEffectivePublicationDatesAndAuthorUnchanged: true,
          superAdminPasswordStillAuthenticates: true, retainedBlobExact: true, immutableHistoryRejectsDeletion: true,
          foreignKeysRecreated: constraints, decisionAndWalletTriggersRecreated: true }, realGoLiveResetExecuted: false }, null, 2));
    }
  });

  it.each(["disabled-rls", "forced-rls", "policy", "table-acl", "column-acl", "sequence-acl", "function-acl", "function-search-path", "schema-acl", "default-acl"])("refuses restored %s changes while rows and sequences match", async failure => {
    const f = await fixture(`security_${failure.replaceAll("-", "_")}`);
    if (failure === "disabled-rls") await pool.query(`alter table "${f.restored}".users disable row level security`);
    if (failure === "forced-rls") await pool.query(`alter table "${f.restored}".users force row level security`);
    if (failure === "policy") await pool.query(`create policy unsafe_read on "${f.restored}".users for select to public using(true)`);
    if (failure === "table-acl") await pool.query(`grant select on "${f.restored}".users to public`);
    if (failure === "column-acl") await pool.query(`grant select(password_hash) on "${f.restored}".users to public`);
    if (failure === "sequence-acl") await pool.query(`grant usage on sequence "${f.restored}".wallet_reference_seq to public`);
    if (failure === "function-acl") await pool.query(`grant execute on function "${f.restored}".reject_wallet_history_mutation() to public`);
    if (failure === "function-search-path") await pool.query(`alter function "${f.restored}".reject_wallet_history_mutation() set search_path to pg_catalog,public`);
    if (failure === "schema-acl") await pool.query(`grant usage on schema "${f.restored}" to public`);
    if (failure === "default-acl") await pool.query(`alter default privileges in schema "${f.restored}" grant select on tables to public`);
    const result = invoke(f.source, ["--execute", "--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect((await pool.query(`select count(*)::int n from "${f.source}".users`)).rows[0].n).toBe(2);
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
  });

  it("refuses removal of an immutable legal version's author before offering execution", async () => {
    const f = await fixture("legal_author", async source => {
      await pool.query(`insert into "${source}".legal_versions(kind,locale,version,body,published_at,effective_at,author_id)
        values('privacy','en',1,'Synthetic author-dependency fixture, never owner-approved content.',now(),now(),$1)`, [testId]);
    });
    const result = invoke(f.source, ["--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("protected-dependencies");
    expect((await pool.query(`select count(*)::int n from "${f.source}".legal_versions`)).rows[0].n).toBe(2);
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
  });

  it.each(["disabled-rls", "custom-policy"])("refuses matching source and restore snapshots with %s outside the canonical security contract", async failure => {
    const alter = (schema: string) => pool.query(failure === "disabled-rls"
      ? `alter table "${schema}".users disable row level security`
      : `create policy unsafe_read on "${schema}".users for select to public using(true)`);
    const f = await fixture(`matching_${failure.replaceAll("-", "_")}`, alter);
    await alter(f.restored);
    const result = invoke(f.source, ["--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("security-contract");
    expect((await pool.query(`select count(*)::int n from "${f.source}".users`)).rows[0].n).toBe(2);
  });

  it("refuses an orphan Agency identity in a corrupted historical snapshot before offering execution", async () => {
    // Simulate an inconsistent historical snapshot only inside disposable fixture
    // schemas. The live migration's role/tenant invariant remains unchanged.
    const f = await fixture("orphan_agency", async source => {
      await pool.query(`alter table "${source}".users drop constraint users_role_agency_check`);
      await pool.query(`update "${source}".users set role='AGENCY_USER',agency_id=null where id=$1`, [testId]);
    }, restored => pool.query(`alter table "${restored}".users drop constraint users_role_agency_check`));
    f.manifest.preservedUserIds = [adminId, testId];
    await writeFile(f.manifestPath, JSON.stringify(f.manifest));
    const result = invoke(f.source, ["--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("preservation");
    expect((await pool.query(`select role from "${f.source}".users where id=$1`, [testId])).rows[0].role).toBe("AGENCY_USER");
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
  });

  it("rechecks a writer committed after verification while the CLI waits for its execution lock", async () => {
    const f = await fixture("snapshot_race");
    const blocker = await pool.connect();
    let child: ReturnType<typeof spawn> | undefined;
    const lock = `${f.source}:go-live-reset`;
    try {
      const blockerPid = (await blocker.query("select pg_backend_pid() pid")).rows[0].pid;
      await blocker.query("select pg_advisory_lock(hashtext($1))", [lock]);
      child = spawn(process.execPath, [resetCliPath, "--execute", "--approval-manifest", f.manifestPath], {
        cwd: process.cwd(), env: { ...process.env, NODE_PATH: resetCliNodePath, NODE_ENV: "test", DATABASE_URL: url, DATABASE_SCHEMA: f.source,
          STORAGE_PROVIDER: "db", RESET_BACKUP_KEY: key.toString("base64"), VERCEL: "", VERCEL_ENV: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "", errors = "";
      child.stdout!.on("data", data => { output += String(data); });
      child.stderr!.on("data", data => { errors += String(data); });
      const completion = new Promise<number | null>((resolve, reject) => { child!.once("close", resolve); child!.once("error", reject); });
      let waiting = false;
      for (let retry = 0; retry < 200; retry++) {
        waiting = (await pool.query("select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) waiting", [blockerPid])).rows[0].waiting;
        if (waiting) break;
        await delay(25);
      }
      expect(waiting, "CLI must finish initial verification and wait on the real execution lock").toBe(true);
      await pool.query(`insert into "${f.source}".agencies(legal_name,email) values('Committed during verification','concurrent@synthetic.example')`);
      await blocker.query("select pg_advisory_unlock(hashtext($1))", [lock]);
      const exit = await completion;
      expect(exit, output || errors).not.toBe(0);
      expect((await pool.query(`select count(*)::int n from "${f.source}".agencies`)).rows[0].n).toBe(2);
      expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
    } finally {
      await blocker.query("select pg_advisory_unlock(hashtext($1))", [lock]); blocker.release();
      if (child && child.exitCode === null) child.kill();
    }
  });

  it.each(["author-not-preserved", "unusable-password-hash", "missing-dzd", "missing-standard-priority", "missing-decision-type", "missing-core-status", "missing-core-transition"])("rejects %s during verified dry-run before offering execution", async failure => {
    const f = await fixture(`protected_${failure.replaceAll("-", "_")}`, async source => {
      if (failure === "author-not-preserved") await pool.query(`update "${source}".users set role='SUPER_ADMIN' where id=$1`, [testId]);
      if (failure === "unusable-password-hash") await pool.query(`update "${source}".users set password_hash='invalid-credential' where id=$1`, [adminId]);
      if (failure === "missing-dzd") await pool.query(`delete from "${source}".currencies where code='DZD'`);
      if (failure === "missing-standard-priority") await pool.query(`delete from "${source}".priorities where code='STANDARD'`);
      if (failure === "missing-decision-type") await pool.query(`delete from "${source}".document_types where code='DECISION_VISA_APPROVAL'`);
      if (failure === "missing-core-status") await pool.query(`delete from "${source}".statuses where code='APPROVED'`);
      if (failure === "missing-core-transition") await pool.query(`delete from "${source}".status_transitions where from_status_id=(select id from "${source}".statuses where code='DRAFT') and to_status_id=(select id from "${source}".statuses where code='SUBMITTED')`);
    });
    if (failure === "author-not-preserved") f.manifest.preservedUserIds = [testId];
    await writeFile(f.manifestPath, JSON.stringify(f.manifest));
    const result = invoke(f.source, ["--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect((await pool.query(`select count(*)::int n from "${f.source}".users`)).rows[0].n).toBe(2);
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
  });

  it("cleans only explicitly classified test catalogue rows while preserving exact approved rows and their dependencies", async () => {
    const f = await fixture("selected_catalogue");
    const selections = { countries: [catalogueIds.country], visa_categories: [catalogueIds.category], visa_types: [catalogueIds.visa], visa_requirements: [catalogueIds.requirement] };
    for (const name of Object.keys(selections)) f.manifest.tableClassifications[name] = "PRESERVE_IDS";
    const manifest = { ...f.manifest, preservedConfigurationIds: selections };
    await writeFile(f.manifestPath, JSON.stringify(manifest));
    const result = invoke(f.source, ["--execute", "--approval-manifest", f.manifestPath]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ verified: true, afterCounts: { countries: 1, visa_categories: 1, visa_types: 1, visa_requirements: 1 } });
    for (const [name, ids] of Object.entries(selections)) {
      expect((await pool.query(`select id from "${f.source}"."${name}"`)).rows).toEqual([{ id: ids[0] }]);
      expect((await pool.query(`select count(*)::int n from "${f.archive}"."${name}"`)).rows[0].n).toBe(2);
    }
  });

  it.each(["unknown-id", "duplicate-id", "malformed-id", "missing-dependency", "protected-table-selection", "unknown-selection-table"])("refuses %s catalogue selection before mutation and retains both catalogue classes", async failure => {
    const f = await fixture(`catalogue_${failure.replaceAll("-", "_")}`);
    const selections: Record<string, string[]> = { countries: [catalogueIds.country], visa_categories: [catalogueIds.category], visa_types: [catalogueIds.visa], visa_requirements: [catalogueIds.requirement] };
    for (const name of Object.keys(selections)) f.manifest.tableClassifications[name] = "PRESERVE_IDS";
    if (failure === "unknown-id") selections.countries = ["ca000000-0000-4000-8000-000000000099"];
    if (failure === "duplicate-id") selections.countries = [catalogueIds.country, catalogueIds.country];
    if (failure === "malformed-id") selections.countries = ["not-a-uuid"];
    if (failure === "missing-dependency") selections.countries = [];
    if (failure === "protected-table-selection") { selections.document_types = []; f.manifest.tableClassifications.document_types = "PRESERVE_IDS"; }
    if (failure === "unknown-selection-table") selections.unknown_table = [];
    await writeFile(f.manifestPath, JSON.stringify({ ...f.manifest, preservedConfigurationIds: selections }));
    const result = invoke(f.source, ["--execute", "--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(failure === "missing-dependency" ? "protected-dependencies" : "classification");
    expect((await pool.query(`select count(*)::int n from "${f.source}".countries`)).rows[0].n).toBe(2);
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
  });

  it.each(["checksum", "encrypted-authentication", "restore", "storage", "target", "preservation", "unclassified", "stale", "incoming-cross-schema-fk", "restored-sequence-state", "restored-sequence-missing"]) ("refuses %s evidence failure and leaves source plus immutable records intact", async failure => {
    const f = await fixture(`guard_${failure.replaceAll("-", "_")}`);
    if (failure === "checksum") await writeFile(f.backup, "tampered");
    if (failure === "encrypted-authentication") {
      const bytes = JSON.parse(await readFile(f.backup, "utf8")); bytes.tag = randomBytes(16).toString("base64");
      const changed = Buffer.from(JSON.stringify(bytes)); await writeFile(f.backup, changed);
      f.manifest.backup.sha256 = createHash("sha256").update(changed).digest("hex");
    }
    if (failure === "restore") await pool.query(`insert into "${f.restored}".agencies(legal_name,email) values('Unexpected','other@synthetic.example')`);
    if (failure === "storage") f.manifest.storage.removeKeys = [];
    if (failure === "target") f.manifest.target.database = "other_database";
    if (failure === "preservation") f.manifest.preservedUserIds = [testId];
    if (failure === "unclassified") delete f.manifest.tableClassifications.agencies;
    if (failure === "stale") await pool.query(`insert into "${f.source}".agencies(legal_name,email) values('Changed after backup','changed@synthetic.example')`);
    if (failure === "incoming-cross-schema-fk") {
      const unrelated = `${f.source}_peer`;
      schemas.unshift(unrelated); // Drop child schema before source/archived parent during cleanup.
      await pool.query(`create schema "${unrelated}"`);
      await pool.query(`create table "${unrelated}".retained_reference(agency_id uuid references "${f.source}".agencies(id))`);
      await pool.query(`insert into "${unrelated}".retained_reference values($1)`, [agencyId]);
    }
    if (failure === "restored-sequence-state") await pool.query("select setval($1::regclass,987,true)", [`${f.restored}.wallet_reference_seq`]);
    if (failure === "restored-sequence-missing") await pool.query(`drop sequence "${f.restored}".wallet_reference_seq`);
    await writeFile(f.manifestPath, JSON.stringify(f.manifest));
    const result = invoke(f.source, ["--execute", "--approval-manifest", f.manifestPath]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain("postgres:postgres");
    expect((await pool.query(`select count(*)::int n from "${f.source}".wallet_transactions`)).rows[0].n).toBe(1);
    expect((await pool.query(`select count(*)::int n from "${f.source}".users`)).rows[0].n).toBe(2);
    expect((await pool.query("select exists(select 1 from pg_namespace where nspname=$1) present", [f.archive])).rows[0].present).toBe(false);
  });
});
