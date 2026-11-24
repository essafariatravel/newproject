import { describe, expect, it } from "vitest";
import { capacity,caseAction } from "../src/app/portal/dashboard-smart";
describe("dashboard wallet capacity",()=>{
 it("uses integer centimes and never rounds up",()=>{expect(capacity("83000",["11000"])?.count).toBe(7);expect(capacity("100.25",["100.26"])?.shortfall).toBe(.01);expect(capacity("0",["100"])?.count).toBe(0)});
 it("rejects invalid amounts or no paid programme",()=>{expect(capacity("-10",["2"])).toBeNull();expect(capacity("100",["0","bad"])).toBeNull();expect(capacity("10",[])).toBeNull()});
 it("uses cheapest paid price",()=>{expect(capacity("2000",["2000","10000"])?.count).toBe(1)});
});
describe("contextual action",()=>{
 it("gives terminal state priority",()=>{expect(caseAction("APPROVED",true,true)).toBe("decision");expect(caseAction("CANCELLED",false,true)).toBe("cancelled");expect(caseAction("REFUSED",false,false)).toBe("decision")});
 it("routes attention and cancellation correctly",()=>{expect(caseAction("IN_PROCESS",true,false)).toBe("documents");expect(caseAction("IN_PROCESS",true,true)).toBe("cancellation");expect(caseAction("SUBMITTED",false,false)).toBe("view")});
});
