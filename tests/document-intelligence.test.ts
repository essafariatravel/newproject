import {describe,it,expect} from "vitest";
import {passportValidity,imageSignals,duplicateGroups} from "@/lib/document-intelligence";
describe("passport validity",()=>{
 it("calculates civil-day validity",()=>{expect(passportValidity("2026-12-26","2026-11-26")).toBe(30);expect(passportValidity("2026-11-25","2026-11-26")).toBe(-1);expect(passportValidity("2026-02-30","2026-11-26")).toBeNull()});
});
describe("image signals",()=>{
 it("recognizes a flat synthetic image",()=>{const bytes=new Uint8ClampedArray(5*5*4).fill(255);const x=imageSignals(bytes,5,5);expect(x.mean).toBeCloseTo(255);expect(x.contrast).toBeCloseTo(0);expect(x.sharpness).toBeCloseTo(0)});
 it("measures detail and original resolution",()=>{const bytes=new Uint8ClampedArray(5*5*4);for(let i=0;i<25;i++){const v=i%2?255:0;bytes.set([v,v,v,255],i*4)}const x=imageSignals(bytes,5,5,1000,2000);expect(x.sharpness).toBeGreaterThan(0);expect(x.ratio).toBe(.5)});
 it("rejects invalid samples",()=>expect(()=>imageSignals(new Uint8ClampedArray(4),5,5)).toThrow());
});
describe("local duplicate groups",()=>{it("compares content signatures independently of file names",()=>expect(duplicateGroups([{item:"a.pdf",hash:"x"},{item:"b.pdf",hash:"y"},{item:"renamed.pdf",hash:"x"}])).toEqual([["a.pdf","renamed.pdf"]]))});
