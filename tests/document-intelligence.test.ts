import {describe,it,expect} from "vitest";
import {readTd3,mrzCheckDigit,passportValidity,expiryCandidates,imageSignals,duplicateGroups} from "@/lib/document-intelligence";
const specimen="P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10";
describe("local TD3 reader",()=>{
 it("reads a synthetic ICAO specimen and validates all digits",()=>{expect(readTd3(specimen)).toEqual({name:"ERIKSSON ANNA MARIA",nationality:"UTO",expiryRaw:"120415",checksPassed:true})});
 it("rejects malformed input and detects altered document digits",()=>{expect(readTd3("invalid")).toBeNull();expect(readTd3(specimen.replace("L898902C3","L898902C4"))?.checksPassed).toBe(false)});
 it("handles optional MRZ fillers and refuses invalid dates",()=>{expect(mrzCheckDigit("<<<<")).toBe(0);expect(readTd3(specimen.replace("120415","121315"))).toBeNull()});
 it("never silently chooses an expiry century",()=>{expect(expiryCandidates("120415","2026-11-26")).toEqual(["1912-04-15","2012-04-15","2112-04-15"])});
 it("calculates civil-day validity",()=>{expect(passportValidity("2026-12-26","2026-11-26")).toBe(30);expect(passportValidity("2026-11-25","2026-11-26")).toBe(-1);expect(passportValidity("2026-02-30","2026-11-26")).toBeNull()});
});
describe("image signals",()=>{
 it("recognizes a flat synthetic image",()=>{const bytes=new Uint8ClampedArray(5*5*4).fill(255);const x=imageSignals(bytes,5,5);expect(x.mean).toBeCloseTo(255);expect(x.contrast).toBeCloseTo(0);expect(x.sharpness).toBeCloseTo(0)});
 it("measures detail and original resolution",()=>{const bytes=new Uint8ClampedArray(5*5*4);for(let i=0;i<25;i++){const v=i%2?255:0;bytes.set([v,v,v,255],i*4)}const x=imageSignals(bytes,5,5,1000,2000);expect(x.sharpness).toBeGreaterThan(0);expect(x.ratio).toBe(.5)});
 it("rejects invalid samples",()=>expect(()=>imageSignals(new Uint8ClampedArray(4),5,5)).toThrow());
});
describe("local duplicate groups",()=>{it("compares content signatures independently of file names",()=>expect(duplicateGroups([{item:"a.pdf",hash:"x"},{item:"b.pdf",hash:"y"},{item:"renamed.pdf",hash:"x"}])).toEqual([["a.pdf","renamed.pdf"]]))});
