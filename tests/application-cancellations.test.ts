import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { applicants as applicantsTb, applications, checklistItems, notifications, walletTransactions } from "@/db/schema";
import { createDraftApplication, submitApplication, changeApplicationStatus } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { applyPriceAdjustment, getApplicationPricing } from "@/lib/price-adjustments";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";
import { cancellationAmountCents, requestApplicationCancellation, decideApplicationCancellation, listApplicationCancellations } from "@/lib/application-cancellations";
import { businessLabel } from "@/lib/business-labels";
import { contentT } from "@/lib/i18n-content";
suiteSetup();
async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string }).id;
}

/** A freshly SUBMITTED app at the standard 120 DZD fee on agency B (fully-funded). */
async function submittedApp(n: number) {
  const agencyB = await agencyByEmail("ops@agencyb.example");
  const staffB = await userByEmail("b-admin@test.example");
  const superA = await userByEmail("superadmin@test.example");
  await adjustWallet({ agencyId: agencyB.id, amount: 1000, reason: `adj-funding-${n}`, actor: superA });
  const app = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
  await db.insert(applicantsTb).values({
    applicationId: app.id, firstName: "Adj", lastName: `Case${n}`, dateOfBirth: "1992-02-02",
    nationality: "Moroccan", passportNumber: `AD${String(n).padStart(8, "0")}`, passportExpiryDate: "2032-02-02",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 2048, data: Buffer.from("%PDF-1.4 test document") },
      checklistItemId: item.id,
    });
  }
  await submitApplication({ applicationId: app.id, actor: staffB });
  const fresh = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
  return { app: fresh, agency: agencyB, agencyUser: staffB };
}


describe("Cancellation and refund — atomic financial workflow",()=>{
 const staff=()=>userByEmail("admin@test.example");
 const reason="Synthetic cancellation test";
 it("accepts explicit exact monetary input only and translates all three notification states",()=>{
  expect(cancellationAmountCents("0")).toBe(0n);
  expect(cancellationAmountCents("12,34")).toBe(1234n);
  for(const value of ["","-1","1e2","0.001","1000000000000","NaN"])expect(()=>cancellationAmountCents(value)).toThrow();
  for(const locale of ["fr","ar"] as const){
   expect(contentT(locale)("Request cancellation")).not.toBe("Request cancellation");
   for(const kind of ["CANCELLATION_REQUESTED","CANCELLATION_APPROVED","CANCELLATION_REFUSED"]) expect(businessLabel(kind,locale)).not.toBe(businessLabel(kind,"en"));
  }
 });
 it("rejects foreign tenants and agency attempts to issue refunds; one pending request only",async()=>{
  const {app,agency,agencyUser}=await submittedApp(601);
  const outsider=await userByEmail("a-admin@test.example");
  await expect(requestApplicationCancellation({applicationId:app.id,actor:outsider,reason})).rejects.toMatchObject({code:"NOT_FOUND"});
  await expect(decideApplicationCancellation({applicationId:app.id,actor:agencyUser,decision:"APPROVED",reason,refundAmount:"120"})).rejects.toMatchObject({code:"FORBIDDEN"});
  const balance=await getBalance(agency.id);
  const outcomes=await Promise.allSettled([1,2].map(()=>requestApplicationCancellation({applicationId:app.id,actor:agencyUser,reason})));
  expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  const rows=await listApplicationCancellations(app.id,agencyUser);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("PENDING");
  expect(await listApplicationCancellations(app.id,outsider)).toHaveLength(0);
  expect(await getBalance(agency.id)).toEqual(balance);
  const notifs=await db.select().from(notifications).where(eq(notifications.applicationId,app.id));
  expect(notifs.filter(n=>n.type==="CANCELLATION_REQUESTED").length).toBeGreaterThan(0);
  expect(notifs.filter(n=>n.type==="CANCELLATION_REQUESTED").some(n=>n.userId===agencyUser.id)).toBe(false);
  await expect(changeApplicationStatus({applicationId:app.id,actor:await staff(),toStatusCode:"CANCELLED",reason})).rejects.toMatchObject({code:"INVALID_TRANSITION"});
 });
 it("refusal preserves original status and balance and allows a new request",async()=>{
  const {app,agency,agencyUser}=await submittedApp(602),actor=await staff();
  const id=await requestApplicationCancellation({applicationId:app.id,actor:agencyUser,reason});
  const balance=await getBalance(agency.id);
  await decideApplicationCancellation({applicationId:app.id,actor,requestId:id,decision:"REFUSED",reason});
  expect(await getBalance(agency.id)).toEqual(balance);
  expect((await db.select().from(applications).where(eq(applications.id,app.id)))[0]!.statusId).toBe(app.statusId);
  expect((await listApplicationCancellations(app.id,agencyUser))[0]!.status).toBe("REFUSED");
  await expect(requestApplicationCancellation({applicationId:app.id,actor:agencyUser,reason})).resolves.toBeTruthy();
 });
 it("partial refund preserves original debit, credits once under concurrency and closes the file",async()=>{
  const {app,agency,agencyUser}=await submittedApp(603),actor=await staff();
  const id=await requestApplicationCancellation({applicationId:app.id,actor:agencyUser,reason});
  const before=await getBalance(agency.id);
  const params={applicationId:app.id,actor,requestId:id,decision:"APPROVED" as const,reason,refundAmount:"35.50"};
  const results=await Promise.allSettled([decideApplicationCancellation(params),decideApplicationCancellation(params)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(Number((await getBalance(agency.id)).balance)-Number(before.balance)).toBe(35.5);
  const pricing=await getApplicationPricing(app.id);
  expect(pricing!.submittedPrice).toBe("120.00");
  expect(pricing!.effectivePrice).toBe("84.50");
  expect(pricing!.adjustments).toHaveLength(1);
  expect(pricing!.adjustments[0]!.type).toBe("REFUND");
  const ledger=await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId,app.id));
  expect(ledger).toHaveLength(2);
  expect(ledger.find(x=>x.type==="APPLICATION_CHARGE")?.amount).toBe("120.00");
  expect((await listApplicationCancellations(app.id,agencyUser))[0]!.refund_amount).toBe("35.50");
  const s=await pool.query("select s.code,a.completed_at from applications a join statuses s on s.id=a.status_id where a.id=$1",[app.id]);
  expect(s.rows[0].code).toBe("CANCELLED");expect(s.rows[0].completed_at).toBeTruthy();
  const events=await db.select().from(notifications).where(eq(notifications.applicationId,app.id));
  expect(events.some(n=>n.type==="CANCELLATION_APPROVED"&&n.userId===agencyUser.id)).toBe(true);
  expect(events.some(n=>n.type==="CANCELLATION_APPROVED"&&n.userId===actor.id)).toBe(false);
 });
 it("uses net paid amount after prior credits, rejects excessive refunds, permits exact full refund",async()=>{
  const {app,agency}=await submittedApp(604),actor=await staff();
  await applyPriceAdjustment({applicationId:app.id,actor,type:"REFUND",amount:"20",reason,idempotencyKey:"prior-"+app.id});
  const before=await getBalance(agency.id);
  const base={applicationId:app.id,actor,decision:"APPROVED" as const,reason};
  await expect(decideApplicationCancellation({...base,refundAmount:"100.01"})).rejects.toMatchObject({code:"VALIDATION"});
  expect(await getBalance(agency.id)).toEqual(before);
  await decideApplicationCancellation({...base,refundAmount:"100"});
  expect((await getApplicationPricing(app.id))!.effectivePrice).toBe("0.00");
  expect(Number((await getBalance(agency.id)).balance)-Number(before.balance)).toBe(100);
 });
 it("supports direct zero-refund cancellation with no wallet entry",async()=>{
  const {app,agency,agencyUser}=await submittedApp(605),actor=await staff();
  const before=await getBalance(agency.id);
  await decideApplicationCancellation({applicationId:app.id,actor,decision:"APPROVED",reason,refundAmount:"0"});
  expect(await getBalance(agency.id)).toEqual(before);
  expect((await getApplicationPricing(app.id))!.adjustments).toHaveLength(0);
  expect((await listApplicationCancellations(app.id,agencyUser))[0]).toMatchObject({origin:"STAFF",status:"APPROVED",refund_amount:"0.00"});
 });
 it("rolls back the refund, cancellation and decision when audit insertion fails",async()=>{
  const {app,agency,agencyUser}=await submittedApp(606),actor=await staff();
  const id=await requestApplicationCancellation({applicationId:app.id,actor:agencyUser,reason});
  const before=await getBalance(agency.id);
  await pool.query(`create function fail_cancel_audit_probe() returns trigger language plpgsql as $probe$ begin if new.action='CANCELLATION_APPROVED' then raise exception 'audit probe failure'; end if; return new; end $probe$; create trigger fail_cancel_audit_probe before insert on audit_logs for each row execute function fail_cancel_audit_probe();`);
  try{await expect(decideApplicationCancellation({applicationId:app.id,actor,requestId:id,decision:"APPROVED",reason,refundAmount:"20"})).rejects.toThrow(/audit probe failure/);}
  finally{await pool.query("drop trigger fail_cancel_audit_probe on audit_logs; drop function fail_cancel_audit_probe()");}
  expect(await getBalance(agency.id)).toEqual(before);
  expect((await getApplicationPricing(app.id))!.adjustments).toHaveLength(0);
  expect((await listApplicationCancellations(app.id,agencyUser))[0]!.status).toBe("PENDING");
 });
});
