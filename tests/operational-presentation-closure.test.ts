import { afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession } from "./helpers/authenticated-session";
import { recordAudit } from "@/lib/audit";
import { listAuditLogs,listWalletTransactions } from "@/lib/queries";
import { createTopupRequest,processTopupRequest } from "@/lib/topup";
import AdminNotificationsPage from "@/app/admin/notifications/page";
import AuditPage from "@/app/admin/audit/page";
import PortalWalletPage from "@/app/portal/wallet/page";
import { getTransactions } from "@/lib/wallet";
import { NotificationsPage } from "@/components/notifications-page";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
vi.mock("next/cache",()=>({revalidatePath:()=>undefined}));
suiteSetup();afterEach(()=>{request.cookie="";});
let topupId:string,agencyId:string;
describe("operational presentation closure",()=>{
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
