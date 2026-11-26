import {describe,it,expect} from "vitest";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {COUNTRY_FLAG_CODES,countryFlagPath} from "@/lib/country-flag-assets";
describe("local country flags",()=>{
 it("has a real SVG for each configured country",()=>{
  for(const code of COUNTRY_FLAG_CODES){const url=countryFlagPath(code)!;const path=join(process.cwd(),"public",url.slice(1));expect(existsSync(path),code).toBe(true);expect(readFileSync(path,"utf8")).toMatch(/^\s*<svg\b/)}
 });
 it("normalizes ISO codes and rejects missing or unknown values",()=>{
  expect(countryFlagPath(" eg ")).toBe("/flags/eg.svg");expect(countryFlagPath("qa")).toBe("/flags/qa.svg");expect(countryFlagPath("../eg")).toBeNull();expect(countryFlagPath("ZZ")).toBeNull();expect(countryFlagPath(null)).toBeNull();
 });
});
