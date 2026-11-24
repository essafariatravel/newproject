import {describe,it,expect} from "vitest";
import {caseLink,queueFilters} from "../src/app/portal/applications/case-workspace";
import {caseAction} from "../src/app/portal/dashboard-smart";
describe("case workspace routes",()=>{
 it("retains queue and filter contracts",()=>{
  expect(queueFilters("active")).toEqual({queue:"active"});
  expect(queueFilters("completed")).toEqual({queue:"completed"});
  expect(queueFilters("attention")).toEqual({documents:"requested"});
  expect(queueFilters("all")).toEqual({});
  expect(caseLink({q:"A & B",status:"SUBMITTED",...queueFilters("active"),per:"50"})).toBe("/portal/applications?q=A+%26+B&status=SUBMITTED&queue=active&per=50");
 });
 it("does not invent actions for waiting cases",()=>{
  expect(caseAction("SUBMITTED",false,false)).toBe("view");
  expect(caseAction("IN_PROCESS",false,false)).toBe("view");
  expect(caseAction("IN_PROCESS",true,false)).toBe("documents");
  expect(caseAction("APPROVED",true,true)).toBe("decision");
  expect(caseAction("IN_PROCESS",false,true)).toBe("cancellation");
 });
});
