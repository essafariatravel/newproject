import {Pool} from "pg";
import {beforeAll,afterAll,beforeEach,describe,it,expect} from "vitest";
import {testDbReady,testConnectionString} from "./helpers/pg";
import {readManagedStorageInventory} from "../scripts/managed-backup-evidence";
let pool:Pool,created=false;
beforeAll(async()=>{
 await testDbReady();pool=new Pool({connectionString:testConnectionString()});
 const r=(await pool.query("select current_database() db,inet_server_port() port,host(inet_server_addr()) host,to_regnamespace('managed_inventory_source') existing")).rows[0];
 if(r.db!=="essafaria_test"||r.port!==5434||!["127.0.0.1","::1"].includes(r.host)||r.existing)throw Error("EXCLUSIVE_LOCAL_INVENTORY_FIXTURE_REQUIRED");
 await pool.query("create schema managed_inventory_source;create schema managed_inventory_provider;create table managed_inventory_source.documents(storage_key text);create table managed_inventory_source.document_blobs(key text,data bytea);create table managed_inventory_source.site_settings(key text,value jsonb);create table managed_inventory_provider.buckets(id text,public boolean);insert into managed_inventory_provider.buckets values('documents',false);create table managed_inventory_provider.objects(bucket_id text,name text,id text default 'synthetic-id',version text default 'v1',updated_at timestamptz default now(),metadata jsonb default '{\"size\":3}')");created=true;
});
beforeEach(async()=>{await pool.query("truncate managed_inventory_source.documents,managed_inventory_source.document_blobs,managed_inventory_source.site_settings,managed_inventory_provider.objects");});
afterAll(async()=>{if(pool){if(created)await pool.query("drop schema managed_inventory_source cascade;drop schema managed_inventory_provider cascade");await pool.end();}});
async function inspect(){const c=await pool.connect();try{await c.query("begin read only");return await readManagedStorageInventory(c,"managed_inventory_source","managed_inventory_provider");}finally{await c.query("rollback");c.release();}}
describe("read-only managed backup object coverage",()=>{
 it("proves DB-backed references without copying bytes or names to the evidence",async()=>{
  await pool.query("insert into managed_inventory_source.document_blobs values('synthetic-key',$1)",[Buffer.from('synthetic data')]);
  await pool.query("insert into managed_inventory_source.documents values('synthetic-key')");
  const r=await inspect();expect(r.status).toBe("VERIFIED_READ_ONLY");expect(r.externalStorage.objectCount).toBe(0);expect(r.externalStorage.referenceCount).toBe(0);expect(r.externalStorage.inventorySha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(r)).not.toContain('synthetic-key');
 });
 it("blocks missing DB-backed references instead of declaring no external recovery needed",async()=>{await pool.query("insert into managed_inventory_source.documents values('missing')");expect((await inspect()).status).toBe("BLOCKED_EXTERNAL_STORAGE_COVERAGE");});
 it("blocks external object bytes even without a business reference",async()=>{await pool.query("insert into managed_inventory_provider.objects(bucket_id,name) values('documents','synthetic-object')");expect((await inspect()).status).toBe("BLOCKED_EXTERNAL_STORAGE_COVERAGE");});
 it('commits the entire external generation and byte total without exposing object names',async()=>{
  await pool.query("insert into managed_inventory_provider.objects(bucket_id,name) values('documents','private-synthetic-name')");const first=await inspect();
  expect(first.externalStorage).toMatchObject({objectCount:1,referenceCount:0,declaredBytes:3});expect(first.externalStorage.objectSetSha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(first)).not.toContain('private-synthetic-name');
  await pool.query("update managed_inventory_provider.objects set version='v2'");const next=await inspect();expect(next.externalStorage.objectSetSha256).not.toBe(first.externalStorage.objectSetSha256);expect(next.externalStorage.inventorySha256).not.toBe(first.externalStorage.inventorySha256);
 });
 it("refuses a write-capable transaction",async()=>{const c=await pool.connect();try{await expect(readManagedStorageInventory(c,"managed_inventory_source","managed_inventory_provider")).rejects.toThrow("read-only");}finally{c.release();}});
 it("blocks a newly introduced writer column outside the known reference coverage",async()=>{await pool.query("create table managed_inventory_source.unknown_writer(storage_key text)");try{await expect(inspect()).rejects.toThrow("Uncovered");}finally{await pool.query("drop table managed_inventory_source.unknown_writer");}});
 it("includes protected historical snapshot references and their database-backed byte copies",async()=>{
  await pool.query("create table managed_inventory_source._restore_202609231044_agencies(logo_key text);create table managed_inventory_source._restore_202609231044_document_blobs(key text,data bytea)");
  try{await pool.query("insert into managed_inventory_source._restore_202609231044_document_blobs values('synthetic-old-logo',$1)",[Buffer.from('synthetic old logo')]);await pool.query("insert into managed_inventory_source._restore_202609231044_agencies values('synthetic-old-logo')");expect((await inspect()).status).toBe('VERIFIED_READ_ONLY');}
  finally{await pool.query("drop table managed_inventory_source._restore_202609231044_agencies,managed_inventory_source._restore_202609231044_document_blobs");}
 });
 it("blocks an archived settings logo with no recovered bytes, then recognizes its archived bytes",async()=>{
  await pool.query("create table managed_inventory_source._restore_202609231044_site_settings(key text,value jsonb);create table managed_inventory_source._restore_202609231044_document_blobs(key text,data bytea)");
  try{
   await pool.query("insert into managed_inventory_source._restore_202609231044_site_settings values('brand.logoKey','\"synthetic-archived-logo\"')");
   expect((await inspect()).status).toBe('BLOCKED_EXTERNAL_STORAGE_COVERAGE');
   await pool.query("insert into managed_inventory_source._restore_202609231044_document_blobs values('synthetic-archived-logo',$1)",[Buffer.from('synthetic archive bytes')]);
   expect((await inspect()).status).toBe('VERIFIED_READ_ONLY');
  }finally{await pool.query("drop table managed_inventory_source._restore_202609231044_site_settings,managed_inventory_source._restore_202609231044_document_blobs");}
 });
 it("rejects malformed known archived settings instead of claiming complete coverage",async()=>{
  await pool.query("create table managed_inventory_source._restore_202609231044_site_settings(key text)");
  try{await expect(inspect()).rejects.toThrow('settings schema');}finally{await pool.query("drop table managed_inventory_source._restore_202609231044_site_settings");}
 });
});
