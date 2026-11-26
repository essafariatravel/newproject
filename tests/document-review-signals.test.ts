import {describe,it,expect} from "vitest";
import {photoRatioDifference,expiryMatchesMrz} from "@/lib/document-intelligence";
describe("document review signals",()=>{
 it("compares a chosen ratio without assuming print dimensions",()=>{expect(photoRatioDifference(350,450,35,45)).toBe(0);expect(photoRatioDifference(500,500,35,45)).toBeGreaterThan(20)});
 it("rejects missing and invalid reference measurements",()=>{expect(photoRatioDifference(350,450,0,45)).toBeNull();expect(photoRatioDifference(350,450,NaN,45)).toBeNull()});
 it("checks MRZ day and month while leaving century explicit",()=>{expect(expiryMatchesMrz("2032-04-15","320415")).toBe(true);expect(expiryMatchesMrz("1932-04-15","320415")).toBe(true);expect(expiryMatchesMrz("2032-04-16","320415")).toBe(false);expect(expiryMatchesMrz("2032-02-30","320230")).toBe(false)});
});
