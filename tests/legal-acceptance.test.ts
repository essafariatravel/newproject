import { describe, expect, it } from "vitest";
import { candidateSuiteSetup } from "./helpers/candidate-migrations";
import { userByEmail } from "./helpers/fixtures";
import { pool } from "@/lib/db";
import { publishLegalContent } from "@/lib/legal";
import { createLegalAcceptanceService } from "@/lib/legal-acceptance";
import { legalContentSha256 } from "@/lib/legal-evidence";

candidateSuiteSetup();
const service = createLegalAcceptanceService(pool);

async function published(kind: "terms" | "privacy" | "commercial" | "staff_confidentiality", locale: "fr" | "en" | "ar" = "en") {
  const author = await userByEmail("superadmin@test.example");
  return publishLegalContent({ kind, locale, body: `TEST ONLY approved ${kind}`, effectiveAt: new Date("2026-01-01"), actor: author });
}

describe("server-canonical legal acceptance evidence", () => {
  it("uses the real database recording instant for owner-authorized publication, and retries without changing it", async()=>{
    const actor=await userByEmail("superadmin@test.example");
    const input={kind:"terms" as const,locale:"ar" as const,body:"SYNTHETIC owner approved recording-time test",effectiveAt:"AT_RECORDING" as const,ownerApprovalReference:"OWNER-MASTER-20261017-synthetic",actor};
    const before=(await pool.query("select clock_timestamp() at")).rows[0].at;
    const result=await publishLegalContent(input);
    const after=(await pool.query("select clock_timestamp() at")).rows[0].at;
    expect(result.effectiveAt).toEqual(result.publishedAt);
    expect(result.publishedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.publishedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect((await publishLegalContent(input)).id).toBe(result.id);
    await expect(publishLegalContent({...input,body:input.body+" changed"})).rejects.toMatchObject({code:"LEGAL_APPROVAL_CHANGED"});
    const metadata=(await pool.query("select metadata from audit_logs where action='LEGAL_PUBLISHED' and entity_id=$1",[result.id])).rows[0].metadata;
    expect(metadata).toMatchObject({ownerApprovalReference:input.ownerApprovalReference,effectiveDatePolicy:"AT_RECORDING",contentSha256:legalContentSha256(input.body)});
  });
  it.each([
    ["terms_b2b", "terms", "EXPLICIT_CHECKBOX"],
    ["privacy_b2b", "privacy", "ACKNOWLEDGEMENT"],
    ["commercial_b2b", "commercial", "EXPLICIT_CHECKBOX"],
    ["staff_confidentiality", "staff_confidentiality", "EXPLICIT_CHECKBOX"],
  ] as const)("records immutable, minimal %s evidence and an atomic audit", async (documentType, kind, method) => {
    const actor = await userByEmail(kind === "staff_confidentiality" ? "superadmin@test.example" : "b-admin@test.example");
    const version = await published(kind);
    const input = { documentType, locale: "en" as const, legalVersionId: version.id, contentSha256: legalContentSha256(version.body), explicit: true, method };
    const result = await service.record(actor, input);
    const proof = (await pool.query("select * from legal_acceptances where id=$1", [result.id])).rows[0];
    expect(proof).toMatchObject({ document_type: documentType, legal_version_id: version.id, user_id: actor.id, agency_id: actor.agencyId, content_sha256: input.contentSha256, locale: "en", method });
    const audit = (await pool.query("select metadata,actor_email,ip_address from audit_logs where entity='legal_acceptance' and entity_id=$1", [result.id])).rows[0];
    expect(audit.actor_email).toBeNull(); expect(audit.ip_address).toBeNull();
    expect(JSON.stringify(audit)).not.toContain(actor.email);
    expect(JSON.stringify(audit)).not.toMatch(/passport|body|filename|token/i);
    expect(await service.record(actor, input)).toEqual(result);
    await expect(pool.query("delete from legal_acceptances where id=$1", [result.id])).rejects.toThrow(/immutable/i);
  });

  it("rejects missing, changed and future legal versions without creating evidence", async () => {
    const actor = await userByEmail("b-admin@test.example"), version = await published("terms", "fr");
    const input = { documentType: "terms_b2b" as const, locale: "fr" as const, legalVersionId: version.id, contentSha256: legalContentSha256(version.body), explicit: true, method: "EXPLICIT_CHECKBOX" as const };
    await expect(service.record(actor, { ...input, explicit: false })).rejects.toMatchObject({ code: "LEGAL_EXPLICIT_REQUIRED" });
    await expect(service.record(actor, { ...input, contentSha256: "0".repeat(64) })).rejects.toMatchObject({ code: "LEGAL_CHANGED" });
    await publishLegalContent({ kind: "terms", locale: "fr", body: "TEST ONLY changed approved terms", effectiveAt: new Date("2026-01-01"), actor: await userByEmail("superadmin@test.example") });
    await expect(service.record(actor, input)).rejects.toMatchObject({ code: "LEGAL_CHANGED" });
    await expect(service.record(actor, { ...input, locale: "ar" })).rejects.toMatchObject({ code: "LEGAL_CHANGED" });
    const future = await publishLegalContent({ kind: "terms", locale: "ar", body: "TEST ONLY future terms", effectiveAt: new Date("2099-01-01"), actor: await userByEmail("superadmin@test.example") });
    await expect(service.record(actor, { ...input, locale: "ar", legalVersionId: future.id, contentSha256: legalContentSha256(future.body) })).rejects.toMatchObject({ code: "LEGAL_CHANGED" });
    expect((await pool.query("select 1 from legal_acceptances where legal_version_id=$1", [version.id])).rowCount).toBe(0);
  });

  it("rejects wrong signers and a stale account without granting permissions", async () => {
    const agency = await userByEmail("b-admin@test.example"), version = await published("staff_confidentiality");
    const input = { documentType: "staff_confidentiality" as const, locale: "en" as const, legalVersionId: version.id, contentSha256: legalContentSha256(version.body), explicit: true, method: "EXPLICIT_CHECKBOX" as const };
    await expect(service.record(agency, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const staff = await userByEmail("superadmin@test.example");
    await expect(service.record({ ...staff, role: "ADMIN" }, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("does not invent a traveller submission contract before its approved workflow definition", async () => {
    const agency = await userByEmail("b-admin@test.example");
    await expect(service.record(agency, { documentType: "traveller_submission_declaration", locale: "en", legalVersionId: crypto.randomUUID(), contentSha256: "0".repeat(64), explicit: true, method: "SUBMISSION_DECLARATION" })).rejects.toMatchObject({ code: "LEGAL_SUBMISSION_POLICY_NOT_APPROVED" });
  });

  it("rolls evidence back when its audit insert fails", async () => {
    const actor = await userByEmail("b-admin@test.example"), version = await published("commercial", "fr");
    await pool.query("create function legal_acceptance_test_failure() returns trigger language plpgsql as $$ begin if new.action='LEGAL_ACCEPTANCE_RECORDED' then raise exception 'synthetic evidence audit failure'; end if; return new; end $$");
    await pool.query("create trigger legal_acceptance_test_failure before insert on audit_logs for each row execute function legal_acceptance_test_failure()");
    try { await expect(service.record(actor, { documentType: "commercial_b2b", locale: "fr", legalVersionId: version.id, contentSha256: legalContentSha256(version.body), explicit: true, method: "EXPLICIT_CHECKBOX" })).rejects.toThrow("synthetic evidence audit failure"); }
    finally { await pool.query("drop trigger legal_acceptance_test_failure on audit_logs"); await pool.query("drop function legal_acceptance_test_failure()"); }
    expect((await pool.query("select 1 from legal_acceptances where legal_version_id=$1", [version.id])).rowCount).toBe(0);
  });
});
