import {describe,it,expect} from "vitest";
import {resolveRequestItem} from "../src/app/portal/applications/document-action-model";
describe("document request association",()=>{
 const items=[{id:"a",documentTypeId:"passport"},{id:"b",documentTypeId:"passport"},{id:"c",documentTypeId:"flight"}];
 it("uses explicit checklist identity",()=>expect(resolveRequestItem(items,{checklistItemId:"b",documentTypeId:"passport"})).toBe("b"));
 it("does not merge ambiguous same-type pieces",()=>expect(resolveRequestItem(items,{checklistItemId:null,documentTypeId:"passport"})).toBeUndefined());
 it("matches only a unique legacy type",()=>expect(resolveRequestItem(items,{checklistItemId:null,documentTypeId:"flight"})).toBe("c"));
 it("retains orphan explicit requests independently",()=>expect(resolveRequestItem(items,{checklistItemId:"unknown",documentTypeId:"flight"})).toBeUndefined());
});
