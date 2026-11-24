import {describe,it,expect} from "vitest";
import {casePeriod,caseSearch,caseDateTime,usableCaseDocument,processingDuration} from "../src/app/portal/applications/case-workspace";
describe("revision 05 case productivity",()=>{
 it("uses Algeria local week bounds",()=>{const x=casePeriod("Chine approuvés cette semaine",new Date("2026-11-24T15:00:00Z"));expect(x.from?.toISOString()).toBe("2026-11-22T23:00:00.000Z");expect(x.to?.toISOString()).toBe("2026-11-29T23:00:00.000Z");expect(caseSearch(x.text)).toEqual({q:"Chine",statusCode:"APPROVED"})});
 it("uses the latest usable document and respects open replacement",()=>{expect(usableCaseDocument("ACCEPTED",true)).toBe(false);expect(usableCaseDocument("UPLOADED",false)).toBe(true);expect(usableCaseDocument("RESUBMISSION_REQUIRED",false)).toBe(false);expect(usableCaseDocument(undefined,false)).toBe(false)});
 it("keeps exact recorded duration",()=>{expect(processingDuration("2026-11-01T11:26:00Z","2026-11-01T11:35:00Z",null,true)?.minutes).toBe(9);expect(caseDateTime(null,"fr")).toBe("—")});
});
