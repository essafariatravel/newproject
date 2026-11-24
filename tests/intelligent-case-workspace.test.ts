import {describe,it,expect} from "vitest";
import {caseSearch,caseSort,validCaseDate,safeCaseReturn,detailLink,processingDuration,durationLabel} from "../src/app/portal/applications/case-workspace";
describe("intelligent case workspace",()=>{
 it("recognizes known terms without AI",()=>{expect(caseSearch("Chine en cours")).toEqual({q:"Chine",statusCode:"IN_PROCESS"});expect(caseSearch("Documents manquants")).toEqual({missing:true});expect(caseSearch("EVT-123")).toEqual({q:"EVT-123"})});
 it("validates dates and sort",()=>{expect(validCaseDate("2026-02-30")).toBeUndefined();expect(validCaseDate("2026-02-28")).toBe("2026-02-28");expect(caseSort("unknown")).toBe("recent")});
 it("restricts return destinations",()=>{expect(safeCaseReturn("https://evil.test")).toBe("/portal/applications");expect(safeCaseReturn("/portal/applications?queue=active&unknown=x")).toBe("/portal/applications?queue=active");expect(detailLink("123","/portal/applications?queue=active")).toContain("returnTo=")});
 it("freezes duration at decision and never invents missing data",()=>{expect(processingDuration("2026-11-01T11:26:00Z","2026-11-01T11:35:00Z",null,true,new Date("2026-11-24"))).toEqual({minutes:9,terminal:true});expect(processingDuration("2026-11-01",null,null,true)).toBeNull();expect(durationLabel(9,"fr")).toBe("9 min")});
});
