import { describe,it,expect } from "vitest";
import { profileCopy,profileTab,validLogoFile,contactChanged,passwordChecks } from "@/app/portal/profile/profile-copy";
describe("agency profile R01",()=>{
  it("accepts only known tabs",()=>{expect(profileTab("account")).toBe("account");expect(profileTab("team")).toBe("team");expect(profileTab(["team"])).toBe("agency");expect(profileTab("unknown")).toBe("agency")});
  it("validates file type, size and name before upload",()=>{const f={type:"image/png",size:2097152,name:"logo.png"};expect(validLogoFile(f)).toBe(true);expect(validLogoFile({...f,size:2097153})).toBe(false);expect(validLogoFile({...f,type:"image/svg+xml"})).toBe(false);expect(validLogoFile({...f,size:0})).toBe(false);expect(validLogoFile({...f,name:"x".repeat(201)})).toBe(false)});
  it("does not treat whitespace as a contact change",()=>{const a={phone:"123",city:"Alger",addressLine:""};expect(contactChanged(a,{...a,city:" Alger "})).toBe(false);expect(contactChanged(a,{...a,addressLine:"Rue 1"})).toBe(true)});
  it("reports password checks without changing server policy",()=>{expect(passwordChecks("old","new","new")).toEqual({length:false,different:true,match:true});expect(passwordChecks("same-password","same-password","same-password").different).toBe(false);expect(passwordChecks("old","new-password-123","new-password-123")).toEqual({length:true,different:true,match:true})});
  it("has complete copy in FR EN AR",()=>{for(const locale of ["fr","en","ar"] as const){const copy=profileCopy(locale);expect(Object.values(copy).every(v=>v.trim().length>0)).toBe(true);expect(Object.keys(copy)).toEqual(Object.keys(profileCopy("en")))}});
});
