import {describe,it,expect} from "vitest";
import {caseDateBoundary,caseResponsibility,durationLabel} from "../src/app/portal/applications/case-workspace";
describe("revision 07",()=>{
 it("uses Algeria day bounds",()=>{expect(caseDateBoundary("2026-11-24")?.toISOString()).toBe("2026-11-23T23:00:00.000Z");expect(caseDateBoundary("2026-11-24",true)?.toISOString()).toBe("2026-11-24T23:00:00.000Z");expect(caseDateBoundary("2026-02-30")).toBeUndefined()});
 it("respects workflow",()=>{expect(caseResponsibility("APPROVED",true,true,false)).toBe("closed");expect(caseResponsibility("IN_PROCESS",false,true,false)).toBe("agency");expect(caseResponsibility("IN_PROCESS",false,false,true)).toBe("cancellation")});
 it("omits empty hours",()=>{expect(durationLabel(4320,"fr")).toBe("3 jours");expect(durationLabel(4320,"en")).toBe("3d")});
});
