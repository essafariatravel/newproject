import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applications, documentRequests, notifications, statuses } from "@/db/schema";
import { createDraftApplication, getChecklist } from "@/lib/applications";
import { listNotificationsForUser } from "@/lib/queries";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });

async function requested() {
  const actor = await userByEmail("agent@test.example");
  const agency = await agencyByEmail("ops@agencya.example");
  const user = await userByEmail("a-user@test.example");
  const visa = (await db.execute(sql`select id from visa_types limit 1`)).rows[0] as {id:string};
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
  const status = (await db.select().from(statuses).where(eq(statuses.code,"DOCUMENTS_CHECKING")))[0]!;
  await db.update(applications).set({statusId:status.id,submittedAt:new Date()}).where(eq(applications.id,app.id));
  const item = (await getChecklist(app.id))[0]!;
  const [request] = await db.insert(documentRequests).values({applicationId:app.id, checklistItemId:item.id,documentTypeId:item.documentTypeId!,type:"REPLACEMENT",reason:"Clear scan",requestedBy:actor.id}).returning();
  const [notification] = await db.insert(notifications).values({userId:user.id,agencyId:agency.id,applicationId:app.id,documentRequestId:request!.id,type:"DOCUMENT_REQUESTED",title:"Document requested",body:"Clear scan"}).returning();
  return {user,actor,app,request:request!,notification:notification!};
}

describe("current notification action queries", () => {
  it("does not resurrect an uncorrelated legacy alert when a dossier has open requests", async () => {
    const {user,app,notification}=await requested();
    const [legacy]=await db.insert(notifications).values({userId:user.id,agencyId:user.agencyId,applicationId:app.id,type:"DOCUMENT_REQUESTED",title:"Historic request",body:"Old request retained for history"}).returning();
    const actions=await listNotificationsForUser(user.id,50,"action");
    expect(actions.map(row=>row.id)).toContain(notification.id);
    expect(actions.map(row=>row.id)).not.toContain(legacy!.id);
    expect((await listNotificationsForUser(user.id)).find(row=>row.id===legacy!.id)?.readAt).toBeNull();
  });
  it("clears fulfilled document actions while retaining their unread history", async () => {
    const {user,request,notification}=await requested();
    expect((await listNotificationsForUser(user.id,50,"action")).map(n=>n.id)).toContain(notification.id);
    await db.update(documentRequests).set({status:"FULFILLED",fulfilledAt:new Date()}).where(eq(documentRequests.id,request.id));
    expect(await listNotificationsForUser(user.id,50,"action")).toEqual([]);
    const history=await listNotificationsForUser(user.id);
    expect(history.find(n=>n.id===notification.id)?.readAt).toBeNull();
  });
  it("filters by category before the limit and keeps reads personal", async () => {
    const {user,actor,notification}=await requested();
    await db.insert(notifications).values(Array.from({length:55},(_,i)=>({userId:user.id,type:"MESSAGE_POSTED",title:`Message ${i}`,body:"A reply",createdAt:new Date(Date.now()+i+1000)})));
    const action=await listNotificationsForUser(user.id,1,"action");
    expect(action.map(n=>n.id)).toEqual([notification.id]);
    expect((await listNotificationsForUser(user.id,5,"wallet"))).toEqual([]);
    expect((await listNotificationsForUser(actor.id,50,"action")).some(n=>n.id===notification.id)).toBe(false);
  });
});
