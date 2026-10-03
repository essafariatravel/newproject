import { describe,expect,it } from "vitest";
import { publicContactDetails } from "@/lib/public-contact";
describe("owner-provided public contact details",()=>{
  it("renders no invented contact, location or office hours when unset",()=>{
    expect(publicContactDetails({})).toEqual({email:"",phone:"",address:"",officeHours:"",social:{}});
  });
  it("suppresses shipped demonstration facts even with harmless case and spacing changes",()=>{
    expect(publicContactDetails({
      "site.contactEmail":" partners@essafaria.EXAMPLE ",
      "site.contactPhone":" +212 500000000 ",
      "site.address":" boulevard Mohammed V, Casablanca, Morocco ",
      "site.officeHours":" Monday – Friday, 09:00 – 18:00 (GMT+1) ",
      "site.social":{linkedin:" https://www.linkedin.com/company/essafaria/ ",instagram:"",x:""},
    })).toEqual({email:"",phone:"",address:"",officeHours:"",social:{}});
  });
  it("preserves configured owner details without a factual fallback",()=>{
    const details={"site.contactEmail":"partners@agency.test","site.contactPhone":"+213 550 123 456","site.address":"Owner-approved address","site.officeHours":"Owner-approved hours","site.social":{instagram:"https://instagram.com/owner_account"}};
    expect(publicContactDetails(details)).toEqual({email:details["site.contactEmail"],phone:details["site.contactPhone"],address:details["site.address"],officeHours:details["site.officeHours"],social:details["site.social"]});
  });
});
