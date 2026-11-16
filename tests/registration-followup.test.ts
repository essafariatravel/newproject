import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { db } from "@/lib/db";
import { agencyRegistrationDocuments, agencyRegistrations, agencyRegistrationFollowupTokens } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { nextIp, registrationData, registrationPdf, userByEmail } from "./helpers/fixtures";
import { getRegistrationDuplicateCandidates, startRegistrationReview, submitAgencyRegistration, approveRegistration, rejectRegistration, requestMoreInformation, addInternalNote } from "@/lib/registrations";
import { createRegistrationFollowup, resolveRegistrationFollowup, uploadRegistrationFollowup } from "@/lib/registration-followup";
import { submitRegistrationAction } from "@/app/actions/registrations";
import { sha256Hex } from "@/lib/file-integrity";

suiteSetup();
async function reviewed() {
  const admin = await userByEmail("admin@test.example");
  const reg = await submitAgencyRegistration({ data: registrationData(), files: [], ipAddress: nextIp() });
  await startRegistrationReview(reg.id, admin);
  return { admin, reg };
}
describe("partnership review", () => {
  it("rejects stale legal acceptance rather than assigning a version never shown", async () => {
    const form=new FormData();
    for(const [key,value] of Object.entries({legalName:"Stale Consent Voyages",contactFirstName:"Amine Benali",email:"stale@consent.example",phone:"+213 550 111 222",locale:"en",renderedAt:String(Date.now()-10_000),terms:"true",privacy:"true",accuracy:"true",termsVersion:"999",privacyVersion:"999"})) form.set(key,value);
    const result=await submitRegistrationAction({},form);
    expect(result.error).toBeTruthy();
    expect(await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.legalName,"Stale Consent Voyages"))).toHaveLength(0);
  });
  it("keeps possible duplicates pending and reports matches only to Staff", async () => {
    const data = registrationData();
    const first = await submitAgencyRegistration({ data, files: [], ipAddress: nextIp() });
    const second = await submitAgencyRegistration({ data, files: [], ipAddress: nextIp() });
    expect(second.id).not.toBe(first.id);
    const admin = await userByEmail("admin@test.example");
    expect((await getRegistrationDuplicateCandidates(second.id, admin)).some((match) => match.id === first.id && match.signals.includes("email"))).toBe(true);
    await expect(getRegistrationDuplicateCandidates(second.id, await userByEmail("a-user@test.example"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("permits uploads only into the specific requested slot and consumes a completed link", async () => {
    const { admin, reg } = await reviewed();
    const issued = await createRegistrationFollowup({ actor: admin, registrationId: reg.id, note: "Please send your company certificate.", slots: [{ category: "COMMERCIAL_REGISTRATION", label: "Company certificate" }] });
    const resolved = await resolveRegistrationFollowup(issued.token);
    expect(resolved?.slots).toHaveLength(1);
    const slot = resolved!.slots[0]!;
    await expect(uploadRegistrationFollowup({ token: issued.token, slotId: "00000000-0000-0000-0000-000000000001", file: registrationPdf() })).rejects.toMatchObject({ code: "INVALID_LINK" });
    await uploadRegistrationFollowup({ token: issued.token, slotId: slot.id, file: registrationPdf() });
    expect(await resolveRegistrationFollowup(issued.token)).toBeNull();
    await expect(uploadRegistrationFollowup({ token: issued.token, slotId: slot.id, file: registrationPdf() })).rejects.toMatchObject({ code: "INVALID_LINK" });
    const storedDocs = await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId, reg.id));
    expect(storedDocs).toHaveLength(1);
    expect(storedDocs[0]!.sha256).toBe(sha256Hex(registrationPdf().data));
    expect((await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, reg.id)))[0]?.status).toBe("UNDER_REVIEW");
  });
  it("revokes previous links and closes follow-up access after approval", async () => {
    const { admin, reg } = await reviewed();
    const values = { actor: admin, registrationId: reg.id, note: "Please send your company certificate.", slots: [{ category: "COMMERCIAL_REGISTRATION" as const, label: "Company certificate" }] };
    const old = await createRegistrationFollowup(values);
    const current = await createRegistrationFollowup(values);
    expect(await resolveRegistrationFollowup(old.token)).toBeNull();
    await approveRegistration({ actor: admin, registrationId: reg.id });
    expect(await resolveRegistrationFollowup(current.token)).toBeNull();
    await expect(createRegistrationFollowup(values)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("forbids Agency actors from issuing document links", async () => {
    const { reg } = await reviewed();
    await expect(createRegistrationFollowup({ actor: await userByEmail("a-admin@test.example"), registrationId: reg.id, note: "Send company registration document.", slots: [{ category: "OTHER", label: "Company document" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("stores a hashed expiring link and refuses an expired token", async () => {
    const {admin,reg}=await reviewed();
    const issued=await createRegistrationFollowup({actor:admin,registrationId:reg.id,note:"Send company registration document.",slots:[{category:"OTHER",label:"Company document"}]});
    const [stored]=await db.select().from(agencyRegistrationFollowupTokens).where(eq(agencyRegistrationFollowupTokens.registrationId,reg.id));
    expect(stored!.tokenHash).toBe(hashToken(issued.token));
    expect(stored!.tokenHash).not.toContain(issued.token);
    const resolved=await resolveRegistrationFollowup(issued.token);
    await db.update(agencyRegistrationFollowupTokens).set({expiresAt:new Date(Date.now()-1000)}).where(eq(agencyRegistrationFollowupTokens.id,stored!.id));
    expect(await resolveRegistrationFollowup(issued.token)).toBeNull();
    await expect(uploadRegistrationFollowup({token:issued.token,slotId:resolved!.slots[0]!.id,file:registrationPdf()})).rejects.toMatchObject({code:"INVALID_LINK"});
    expect(await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId,reg.id))).toHaveLength(0);
  });
  it("rejects a real requested slot belonging to another registration", async () => {
    const first=await reviewed();const second=await reviewed();
    const values={actor:first.admin,note:"Send company registration document.",slots:[{category:"OTHER" as const,label:"Company document"}]};
    const own=await createRegistrationFollowup({...values,registrationId:first.reg.id});
    const other=await createRegistrationFollowup({...values,registrationId:second.reg.id});
    const otherSlot=(await resolveRegistrationFollowup(other.token))!.slots[0]!.id;
    await expect(uploadRegistrationFollowup({token:own.token,slotId:otherSlot,file:registrationPdf()})).rejects.toMatchObject({code:"INVALID_LINK"});
    expect(await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId,second.reg.id))).toHaveLength(0);
    expect(await resolveRegistrationFollowup(own.token)).not.toBeNull();
  });
  it("keeps old verification links revoked after rejection and reopening", async () => {
    const {admin,reg}=await reviewed();
    const issued=await createRegistrationFollowup({actor:admin,registrationId:reg.id,note:"Send company registration document.",slots:[{category:"OTHER",label:"Company document"}]});
    await rejectRegistration(reg.id,admin,"Unable to verify this partnership request.");
    await startRegistrationReview(reg.id,admin);
    await requestMoreInformation(reg.id,admin,"Please clarify the agency trading details.");
    expect(await resolveRegistrationFollowup(issued.token)).toBeNull();
  });
  it("enforces service-level Staff guards on review, notes and rejection", async () => {
    const {reg}=await reviewed();
    const actor=await userByEmail("a-admin@test.example");
    await expect(addInternalNote(reg.id,actor,"Private staff note")).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(requestMoreInformation(reg.id,actor,"Please send more information.")).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(rejectRegistration(reg.id,actor,"Reject this registration please.")).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("serializes an approval/rejection race without half-approved agencies", async () => {
    const {admin,reg}=await reviewed();
    const results=await Promise.allSettled([approveRegistration({actor:admin,registrationId:reg.id}),rejectRegistration(reg.id,admin,"Unable to verify partnership details.")]);
    expect(results.filter((result)=>result.status==="fulfilled")).toHaveLength(1);
    const [stored]=await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id,reg.id));
    expect(stored!.status==="APPROVED" ? stored!.agencyId!==null : stored!.status==="REJECTED" && stored!.agencyId===null).toBe(true);
  });
});
