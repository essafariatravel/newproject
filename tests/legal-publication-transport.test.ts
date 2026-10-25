import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { db } from "@/lib/db";
import { LEGAL_KINDS } from "@/lib/legal";
import { updateSiteSettingsAction } from "@/app/actions/admin";
import SettingsPage from "@/app/admin/settings/page";
import { candidateSuiteSetup } from "./helpers/candidate-migrations";
import { resetData } from "./helpers/pg";
import { seedFixtures,userByEmail } from "./helpers/fixtures";
import { createSession } from "./helpers/authenticated-session";
import { createSession as passwordSession } from "@/lib/auth";
import { request } from "./helpers/request";

candidateSuiteSetup();
beforeEach(async()=>{await resetData();await seedFixtures();await db.execute(sql`truncate legal_acceptances,legal_versions`);request.cookie="";});
afterEach(async()=>{request.cookie="";await db.execute(sql`drop trigger if exists transport_audit_failure on audit_logs`);await db.execute(sql`drop function if exists transport_audit_failure()`);});
async function owner(){request.cookie=(await createSession((await userByEmail("superadmin@test.example")).id)).token;}
async function result(f:FormData){try{await updateSiteSettingsAction(f);}catch(e){const message=String((e as {digest?:string}).digest??e);if(!message.includes("NEXT_REDIRECT"))throw e;return decodeURIComponent(message);}throw Error("Feedback redirect required");}
function form(){const f=new FormData();f.set("section","legal");f.set("legal.datePolicy","AT_RECORDING");f.set("legal.ownerApprovalReference","OWNER_APPROVED_SYNTHETIC_TRANSPORT_20261025");f.set("legal.ownerConfirmed","yes");for(const locale of ["en","fr","ar"])for(const kind of LEGAL_KINDS)f.set(`legal.${kind}.${locale}`,`SYNTHETIC ONLY ${kind}:${locale} نص اختبار`);return f;}

describe("owner publication through the authenticated existing action and PostgreSQL",()=>{
 it("atomically records every existing kind/language at the real DB instant and is idempotent",async()=>{
  await owner();const f=form();expect(await result(f)).toContain("Approved legal versions published");
  const rows=(await db.execute(sql`select kind,locale,version,body,effective_at,published_at from legal_versions order by kind,locale`)).rows;
  expect(rows).toHaveLength(21);expect(new Set(rows.map(r=>String(r.published_at)))).toHaveLength(1);
  for(const row of rows){expect(row.effective_at).toEqual(row.published_at);expect(row.version).toBe(1);expect(row.body).toBe(f.get(`legal.${row.kind}.${row.locale}`));}
  const audits=(await db.execute(sql`select metadata from audit_logs where action='LEGAL_PUBLISHED'`)).rows;
  expect(audits).toHaveLength(21);for(const audit of audits)expect(audit.metadata).toMatchObject({effectiveDatePolicy:"AT_RECORDING",ownerApprovalReference:"OWNER_APPROVED_SYNTHETIC_TRANSPORT_20261025"});
  expect(await result(f)).toContain("Approved legal versions published");
  expect((await db.execute(sql`select count(*)::int n from legal_versions`)).rows[0]!.n).toBe(21);
  expect((await db.execute(sql`select count(*)::int n from audit_logs where action='LEGAL_PUBLISHED'`)).rows[0]!.n).toBe(21);
 });
 it("rolls back the complete publication batch if a later mandatory audit fails",async()=>{
  await owner();await db.execute(sql`create function transport_audit_failure() returns trigger language plpgsql as $$ begin if new.action='LEGAL_PUBLISHED' and new.metadata->>'kind'='privacy' then raise exception 'Synthetic audit unavailable'; end if; return new; end $$`);await db.execute(sql`create trigger transport_audit_failure before insert on audit_logs for each row execute function transport_audit_failure()`);
  expect(await result(form())).toContain("error=");expect((await db.execute(sql`select count(*)::int n from legal_versions`)).rows[0]!.n).toBe(0);expect((await db.execute(sql`select count(*)::int n from audit_logs where action='LEGAL_PUBLISHED'`)).rows[0]!.n).toBe(0);
 });
 it("refuses unfinished facts and unverified password sessions before publication",async()=>{
  await owner();const f=form();f.set("legal.terms.fr","Responsable [NOM À RENSEIGNER]");expect(await result(f)).toContain("error=");expect((await db.execute(sql`select count(*)::int n from legal_versions`)).rows[0]!.n).toBe(0);
  request.cookie=(await passwordSession((await userByEmail("superadmin@test.example")).id)).token;
  expect(await result(form())).toContain("error=");expect((await db.execute(sql`select count(*)::int n from legal_versions`)).rows[0]!.n).toBe(0);
 });
 it.each(["fr","ar"] as const)("renders the recording policy and existing types in %s without changing legal texts",async locale=>{
  await owner();const html=renderToStaticMarkup(await SettingsPage({searchParams:Promise.resolve({lang:locale})}));
  expect(html).toContain('name="legal.datePolicy"');expect(html).toContain('value="APPROVED_DATE" selected=""');expect(html).not.toContain('value="AT_RECORDING" selected=""');expect(html).toContain('name="legal.ownerApprovalReference"');
  for(const kind of LEGAL_KINDS)expect(html).toContain(`name="legal.${kind}.${locale}"`);
  expect(html).toContain('dir="rtl"');expect((await db.execute(sql`select count(*)::int n from legal_versions`)).rows[0]!.n).toBe(0);
 });
});
