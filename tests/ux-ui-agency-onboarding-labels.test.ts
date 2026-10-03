import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const src=readFileSync(new URL("../src/app/admin/agencies/page.tsx",import.meta.url),"utf8");
describe("Admin agency onboarding labels",()=>{
  it("binds each onboarding label to its input",()=>{
    for(const id of ["agency-legal-name","agency-trading-name","agency-email","agency-phone","agency-city","agency-country","agency-tax-id","agency-admin-name","agency-admin-username"]){
      expect(src).toContain(`htmlFor="${id}"`);
      expect(src).toContain(`id="${id}"`);
    }
  });
});