import { afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession } from "./helpers/authenticated-session";
import { recordAudit } from "@/lib/audit";
import { listAuditLogs,listWalletTransactions,listCountries,listVisaTypesWithRelations } from "@/lib/queries";
import { createTopupRequest,processTopupRequest } from "@/lib/topup";
import AdminNotificationsPage from "@/app/admin/notifications/page";
import CountriesConfigPage from "@/app/admin/config/countries/page";
import AdminAgenciesPage from "@/app/admin/agencies/page";
import AuditPage from "@/app/admin/audit/page";
import PortalWalletPage from "@/app/portal/wallet/page";
import { getTransactions } from "@/lib/wallet";
import { NotificationsPage } from "@/components/notifications-page";
import { db } from "@/lib/db";
import { users,countries } from "@/db/schema";
import { eq } from "drizzle-orm";
vi.mock("next/cache",()=>({revalidatePath:()=>undefined}));
suiteSetup();afterEach(()=>{request.cookie="";});
let topupId:string,agencyId:string;
describe("operational presentation closure",()=>{
  it("associates each agency onboarding field with its visible label",async()=>{
    request.cookie=(await createSession((await userByEmail("superadmin@test.example")).id)).token;
    const html=renderToStaticMarkup(await AdminAgenciesPage({searchParams:Promise.resolve({q:"onboarding-labels-no-existing-fixture"})}));
    for(const name of ["legalName","tradingName","email","phone","city","country","billingTaxId","adminName","adminUsername","adminPassword"]){
      const control=html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`))?.[0];
      expect(control).toBeDefined();
      const id=control?.match(/\bid="([^"]+)"/)?.[1];
      expect(Boolean(id&&html.includes(`for="${id}"`)),`${name} must use its visible onboarding label`).toBe(true);
    }
  });
  it.each(["Synthetic legacy region",null])("preserves region %s when editing other country fields",async(region)=>{
    const country=(await listCountries())[0]!;
    await db.update(countries).set({region}).where(eq(countries.id,country.id));
    try{
      request.cookie=(await createSession((await userByEmail("superadmin@test.example")).id)).token;
      const html=renderToStaticMarkup(await CountriesConfigPage({searchParams:Promise.resolve({})}));
      const form=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m=>m[0]).find(f=>f.includes(`value="${country.id}"`)&&f.includes('<select'));
      expect(form).toBeDefined();
      const control=form?.match(/<select\b[^>]*name="region"[^>]*>[\s\S]*?<\/select>/)?.[0];
      const selected=control?.match(/<option\b[^>]*\bselected=""[^>]*>/)?.[0];
      expect(selected?.match(/\bvalue="([^"]*)"/)?.[1],"unrelated country edits must keep the existing region").toBe(region??"");
    }finally{await db.update(countries).set({region:country.region}).where(eq(countries.id,country.id));}
  });
  it("counts each country's actual visa programmes rather than the inner visa ID",async()=>{
    const programmes=await listVisaTypesWithRelations();
    expect(programmes.length).toBeGreaterThan(0);
    const rows=await listCountries();
    for(const country of rows){
      expect(country.usageCount,`${country.iso2} programme count`).toBe(programmes.filter(({vt})=>vt.countryId===country.id).length);
    }
  });
  it("names the country search control independently of its placeholder",async()=>{
    request.cookie=(await createSession((await userByEmail("superadmin@test.example")).id)).token;
    const html=renderToStaticMarkup(await CountriesConfigPage({searchParams:Promise.resolve({})}));
    const control=html.match(/<input\b[^>]*name="q"[^>]*>/)?.[0];
    expect(control).toBeDefined();
    const label=control?.match(/\baria-label="([^"]+)"/)?.[1];
    const id=control?.match(/\bid="([^"]+)"/)?.[1];
    expect(Boolean(label?.trim()||(id&&html.includes(`for="${id}"`))),"country search needs a persistent accessible name").toBe(true);
  });
  it("gives each country creation field its visible label as an accessible name",async()=>{
    request.cookie=(await createSession((await userByEmail("superadmin@test.example")).id)).token;
    const html=renderToStaticMarkup(await CountriesConfigPage({searchParams:Promise.resolve({})}));
    const form=html.slice(html.indexOf('<h2',html.indexOf('</table>')));
    for(const name of ["name","iso2","region"]){
      const control=form.match(new RegExp(`<(?:input|select)\\b[^>]*name="${name}"[^>]*>`))?.[0];
      expect(control).toBeDefined();
      const id=control?.match(/\bid="([^"]+)"/)?.[1];
      const wrapped=new RegExp(`<label\\b[^>]*>(?:(?!</label>)[\\s\\S])*<(?:input|select)\\b[^>]*name="${name}"[^>]*>(?:(?!</label>)[\\s\\S])*</label>`).test(form);
      expect(Boolean(id&&form.includes(`for="${id}"`))||wrapped,`${name} must associate its visible label`).toBe(true);
    }
  });
  it("Staff notification action filter excludes a resolved historical top-up",async()=>{
    const actor=await userByEmail("b-admin@test.example"),staff=await userByEmail("admin@test.example"),bytes=Buffer.from("%PDF-1.4 synthetic bank receipt");
    const topup=await createTopupRequest({agencyId:actor.agencyId!,actor,amount:300,proof:{name:"receipt.pdf",type:"application/pdf",size:bytes.length,data:bytes}});
    topupId=topup.id;agencyId=actor.agencyId!;
    await processTopupRequest({requestId:topup.id,actor:staff,decision:"CREDIT",decisionNote:"Verified synthetic bank receipt"});
    request.cookie=(await createSession(staff.id)).token;
    const page=await AdminNotificationsPage({searchParams:Promise.resolve({filter:"action"})});
    const html=renderToStaticMarkup(await NotificationsPage(page.props));
    expect(html).not.toContain("#topup-"+topup.id);
  });
  it("links the immutable credit to its archived top-up reference and private receipt",async()=>{
    const paged=await listWalletTransactions({agencyId}),compact=await getTransactions(agencyId);
    const match=paged.rows.find(r=>r.topupRequestId===topupId)!;
    expect(match.topupReference).toMatch(/^TOP-/);expect(match.tx.type).toBe("CREDIT");
    expect(compact.find(r=>r.tx.id===match.tx.id)).toMatchObject({topupRequestId:topupId,topupReference:match.topupReference});
    request.cookie=(await createSession((await userByEmail("b-admin@test.example")).id)).token;
    const html=renderToStaticMarkup(await PortalWalletPage({searchParams:Promise.resolve({})}));
    expect(html).toContain(`/api/topups/${topupId}/proof`);expect(html).toContain(match.topupReference!);
  });
  it("stores and presents individual usernames and IDs despite one shared mailbox",async()=>{
    const a=await userByEmail("a-admin@test.example"),member=await userByEmail("a-user@test.example");
    await db.update(users).set({email:a.email}).where(eq(users.id,member.id));
    const b={...member,email:a.email};
    expect(a.email).toBe(b.email);
    for(const actor of [a,b])await recordAudit({actor,action:"IDENTITY_PRESENTATION_PROBE",entity:"application",entityId:"00000000-0000-4000-8000-000000000999",metadata:{reference:"SYNTHETIC-AUDIT-001"}});
    const result=await listAuditLogs({action:"IDENTITY_PRESENTATION_PROBE"});expect(result.rows).toHaveLength(2);
    for(const actor of [a,b])expect(result.rows.find(r=>r.log.actorId===actor.id)).toMatchObject({actorUsername:actor.username,log:{metadata:{actorUsername:actor.username,actorName:actor.name}}});
    request.cookie=(await createSession((await userByEmail("superadmin@test.example")).id)).token;
    const html=renderToStaticMarkup(await AuditPage({searchParams:Promise.resolve({action:"IDENTITY_PRESENTATION_PROBE"})}));
    for(const actor of [a,b]){expect(html).toContain(actor.id);expect(html).toContain(actor.username!);}
    expect(html).toContain('dateTime=');expect(html).toContain('UTC');expect(html).toContain('/admin/applications/00000000-0000-4000-8000-000000000999');
  });
});
