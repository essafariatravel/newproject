import {describe,it,expect} from "vitest";
import {verifiedOcrCandidates,uniqueVerifiedOcr,mrzCheckDigit} from "@/lib/document-intelligence";
const a="P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",b="L898902C36UTO7408122F1204159ZE184226B<<<<<10",mrz=a+"\n"+b;
describe("native OCR strict MRZ recovery",()=>{
 it("accepts a complete valid pair in noisy OCR",()=>expect(uniqueVerifiedOcr(["PASSPORT\n"+mrz+"\nOTHER"])).toBe(mrz));
 it("accepts a joined 88-character read",()=>expect(uniqueVerifiedOcr([a+b])).toBe(mrz));
 it("normalizes spacing and case without guessing characters",()=>expect(uniqueVerifiedOcr([a.toLowerCase()+"\r\n"+b.split("").join(" ")])).toBe(mrz));
 it("deduplicates agreeing passes",()=>expect(uniqueVerifiedOcr([mrz,a+b])).toBe(mrz));
 it("rejects malformed and corrupted candidates",()=>expect(uniqueVerifiedOcr([mrz.replace("L898902C3","L898902C4"),a,"not a passport"])).toBeNull());
 it("rejects ambiguous valid readings",()=>{
  let line="X"+b.slice(1);line=line.slice(0,9)+mrzCheckDigit(line.slice(0,9))+line.slice(10);
  line=line.slice(0,43)+mrzCheckDigit(line.slice(0,10)+line.slice(13,20)+line.slice(21,43));
  expect(verifiedOcrCandidates(a+"\n"+line)).toHaveLength(1);
  expect(uniqueVerifiedOcr([mrz,a+"\n"+line])).toBeNull();
 });
});
