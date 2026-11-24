import {describe,it,expect} from "vitest";
import {caseQueryFilters,csvCell,safeCaseReturn} from "../src/app/portal/applications/case-workspace";
describe("revision 07 search",()=>{
 it("preserves supported filters",()=>{expect(caseQueryFilters({q:"Chine approuvés",focus:"unread"})).toMatchObject({q:"Chine",statusCode:"APPROVED",caseFocus:"unread"});expect(caseQueryFilters({focus:"bad"}).caseFocus).toBeUndefined();expect(safeCaseReturn("/portal/applications?focus=unread")).toContain("focus=unread")});
 it("neutralizes CSV formulas and quotes",()=>{expect(csvCell("=1+1")).toBe("\"'=1+1\"");expect(csvCell('a"b')).toBe('"a""b"');expect(csvCell("normal")).toBe('"normal"')});
});
