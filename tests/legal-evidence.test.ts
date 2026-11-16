import {describe,expect,it} from "vitest";
import { buildLegalEvidence, legalAcceptanceRequired, LEGAL_ACCEPTANCE_TYPES } from "@/lib/legal-evidence";
const version={id:"11111111-1111-4111-8111-111111111111",version:1,body:"Synthetic approved legal text",locale:"fr" as const};
const input={documentType:"terms_b2b" as const,version,userId:"22222222-2222-4222-8222-222222222222",agencyId:"33333333-3333-4333-8333-333333333333",acceptedAt:new Date("2026-10-15T12:00:00.000Z"),method:"EXPLICIT_CHECKBOX" as const};
describe("minimal immutable legal acceptance evidence",()=>{
 it("supports five separate events without conflating privacy acknowledgement with contract consent",()=>{
  expect(LEGAL_ACCEPTANCE_TYPES).toEqual(["terms_b2b","privacy_b2b","commercial_b2b","staff_confidentiality","traveller_submission_declaration"]);
  expect(()=>buildLegalEvidence({...input,documentType:"privacy_b2b"})).toThrow();
  expect(buildLegalEvidence({...input,documentType:"privacy_b2b",method:"ACKNOWLEDGEMENT"}).documentType).toBe("privacy_b2b");
 });
 it("records only canonical identities/version/hash/locale/time/method, ignoring arbitrary traveller fields",()=>{
  const result=buildLegalEvidence({...input,passport:"DO_NOT_RECORD",filename:"passport.jpg",password:"DO_NOT_RECORD",document:version.body} as typeof input);
  expect(Object.keys(result).sort()).toEqual(["acceptedAt","agencyId","contentSha256","documentType","legalVersionId","locale","method","userId","version"].sort());
  expect(JSON.stringify(result)).not.toMatch(/DO_NOT_RECORD|passport|Synthetic approved/);
  expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.acceptedAt).toBe("2026-10-15T12:00:00.000Z");
 });
 it("requires new acceptance for exact new version, locale, content digest or document type",()=>{
  const proof=buildLegalEvidence(input);expect(legalAcceptanceRequired(input.documentType,version,proof)).toBe(false);
  for(const updated of [{...version,version:2},{...version,body:version.body+" changed"},{...version,locale:"ar" as const},{...version,id:"44444444-4444-4444-8444-444444444444"}])expect(legalAcceptanceRequired(input.documentType,updated,proof)).toBe(true);
  expect(legalAcceptanceRequired("commercial_b2b",version,proof)).toBe(true);expect(legalAcceptanceRequired(input.documentType,version,null)).toBe(true);
 });
 it("rejects malformed versions/dates, unsupported types or methods",()=>{
  expect(()=>buildLegalEvidence({...input,version:{...version,version:0}})).toThrow();
  expect(()=>buildLegalEvidence({...input,acceptedAt:new Date(NaN)})).toThrow();
  expect(()=>buildLegalEvidence({...input,documentType:"passport" as never})).toThrow();
  expect(()=>buildLegalEvidence({...input,method:"IMPLIED" as never})).toThrow();
 });
});
