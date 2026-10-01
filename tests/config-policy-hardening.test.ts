import { describe, expect, it } from "vitest";
import { assertWorkflowCode, assertMutableWorkflowState, validateVisaActivation } from "@/lib/configuration-policy";

describe("configuration engine safeguards",()=>{
  it("refuses unsupported engine states",()=>expect(()=>assertWorkflowCode("MAGIC_APPROVAL")).toThrow());
  it("refuses an embassy code alias which the operational engine does not interpret",()=>expect(()=>assertWorkflowCode("SENT_TO_EMBASSY")).toThrow());
  it.each(["DRAFT","SUBMITTED","DOCUMENTS_CHECKING","DOCUMENTS_REQUESTED","IN_PROCESS","SENT_TO_EMBASSY","APPROVED","REJECTED","CANCELLED"])("protects the core %s state",code=>expect(()=>assertMutableWorkflowState(code)).toThrow());
  it("refuses activation without active relationships, translations and checklist",()=>{
    expect(()=>validateVisaActivation({countryActive:false,categoryActive:true,name:"Visit",nameFr:"Visite",nameAr:"زيارة",fee:"100",minDays:0,maxDays:0,agencyRequirements:1})).toThrow();
    expect(()=>validateVisaActivation({countryActive:true,categoryActive:true,name:"Visit",nameFr:null,nameAr:"زيارة",fee:"100",minDays:0,maxDays:0,agencyRequirements:1})).toThrow();
    expect(()=>validateVisaActivation({countryActive:true,categoryActive:true,name:"Visit",nameFr:"Visite",nameAr:"زيارة",fee:"100",minDays:0,maxDays:0,agencyRequirements:0})).toThrow();
  });
});
