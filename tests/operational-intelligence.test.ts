import {describe,it,expect} from "vitest";
import {bookingCatalogueFingerprint} from "@/lib/booking-catalogue-fingerprint";
import {assessTravelDeadline,civilDay,algeriaToday} from "@/lib/travel-deadline";
import {projectCatalogueChanges} from "@/lib/catalogue-change-model";
import {operationalCopy} from "@/lib/operational-copy";
describe("Smart decision assistance",()=>{
 const programme={fee:"15000.00",minDays:5,maxDays:10};
 const a={documentTypeId:"a",name:"Passport",nameFr:"Passeport",nameAr:"جواز",code:"PASSPORT",required:true,sortOrder:1,notes:null};
 const b={...a,documentTypeId:"b",code:"PHOTO",sortOrder:2};
 const original=bookingCatalogueFingerprint(programme,[a,b]);
 it("normalizes row order and numeric price formatting",()=>{expect(bookingCatalogueFingerprint({...programme,fee:"15000"},[b,a])).toBe(original)});
 it("detects change to price, processing time, required flag, notes and translations",()=>{
  for(const [p,r] of [[{...programme,fee:"16000"},[a,b]],[{...programme,maxDays:11},[a,b]],[programme,[{...a,required:false},b]],[programme,[{...a,notes:"new"},b]],[programme,[{...a,nameAr:"different"},b]],[programme,[a]]] as const)expect(bookingCatalogueFingerprint(p,r)).not.toBe(original);
 });
});
describe("Smart travel deadline",()=>{
 it("uses a civil Algerian planning calendar and rejects impossible dates",()=>{
  expect(civilDay("2026-02-30")).toBeNull();expect(algeriaToday(new Date("2026-11-26T23:15:00Z"))).toBe("2026-11-27");
  expect(assessTravelDeadline("2026-11-29","2026-11-26",1,2).workingDays).toBe(0);
  expect(assessTravelDeadline("2026-11-30","2026-11-26",1,2).state).toBe("tight");
  expect(assessTravelDeadline("2026-12-06","2026-11-26",1,2).state).toBe("favourable");
  expect(assessTravelDeadline("2026-11-25","2026-11-26",1,2).state).toBe("invalid");
  expect(assessTravelDeadline("2026-12-06","2026-11-26",0,0).state).toBe("unknown");
  expect(assessTravelDeadline("","2026-11-26",1,2).state).toBe("none");
 });
});
describe("Visa change intelligence",()=>{
 const at=new Date("2026-11-26T09:00:00Z");
 const event={id:"a",programmeId:"p",action:"CONFIG_VISA_TYPE_UPDATED",createdAt:at,metadata:{oldValues:{active:true,fee:"1000",currency:"DZD",processingMinDays:3,processingMaxDays:5},newValues:{fee:"2000",currency:"DZD",processingMinDays:4,processingMaxDays:6},actorName:"PRIVATE",internalNotes:"PRIVATE"}};
 it("projects only verified public-to-agency changes, deduplicates and redacts",()=>{
  const result=projectCatalogueChanges([event,{...event,id:"b"}],new Set(["p"]));
  expect(result.map(x=>x.kind)).toEqual(["price","duration"]);expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(projectCatalogueChanges([event],new Set(["other"]))).toEqual([]);
  expect(projectCatalogueChanges([{...event,metadata:{...event.metadata,oldValues:{...event.metadata.oldValues,active:false}}}],new Set(["p"]))).toEqual([]);
 });
 it("shows publication and explicitly marked requirement changes only",()=>{
  expect(projectCatalogueChanges([{...event,action:"CONFIG_REQUIREMENT_ADDED",metadata:{programmeWasActive:true}}],new Set(["p"]))[0]?.kind).toBe("requirements");
  expect(projectCatalogueChanges([{...event,action:"CONFIG_REQUIREMENT_ADDED",metadata:{}}],new Set(["p"]))).toEqual([]);
  expect(projectCatalogueChanges([{...event,action:"CONFIG_VISA_TYPE_TOGGLED",metadata:{oldValues:{active:false},newValues:{active:true}}}],new Set(["p"]))[0]?.kind).toBe("published");
 });
 it("has complete FR/EN/AR keys",()=>{expect(Object.keys(operationalCopy.fr).sort()).toEqual(Object.keys(operationalCopy.en).sort());expect(Object.keys(operationalCopy.ar).sort()).toEqual(Object.keys(operationalCopy.en).sort())});
});
