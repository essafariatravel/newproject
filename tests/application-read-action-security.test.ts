import { afterEach,beforeAll,describe,expect,it,vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession } from "./helpers/authenticated-session";
import { createDraftApplication } from "@/lib/applications";
import { submissionGateFor,historyFor } from "@/app/actions/applications";
vi.mock("next/cache",()=>({revalidatePath:()=>undefined}));
suiteSetup();let applicationId:string;
beforeAll(async()=>{
  const {db}=await import("@/lib/db"),{sql}=await import("drizzle-orm");
  const actor=await userByEmail("a-admin@test.example");
  const visa=(await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as {id:string};
  applicationId=(await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor})).id;
});
afterEach(()=>{request.cookie="";});
describe("private dossier read server actions",()=>{
  it.each([["submission gate",submissionGateFor],["history",historyFor]] as const)("%s refuses anonymous crafted dossier IDs",async(_name,action)=>{
    await expect(action(applicationId)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  });
  it.each([["submission gate",submissionGateFor],["history",historyFor]] as const)("%s refuses another tenant's valid dossier ID",async(_name,action)=>{
    request.cookie=(await createSession((await userByEmail("b-admin@test.example")).id)).token;
    await expect(action(applicationId)).rejects.toMatchObject({code:"NOT_FOUND"});
  });
  it.each([["submission gate",submissionGateFor],["history",historyFor]] as const)("%s remains available to the authenticated owning agency",async(_name,action)=>{
    request.cookie=(await createSession((await userByEmail("a-admin@test.example")).id)).token;
    expect(await action(applicationId)).toBeDefined();
  });
});
