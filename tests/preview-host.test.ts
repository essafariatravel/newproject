import {describe,it,expect} from "vitest";
import {trustedPreviewOrigin} from "../scripts/lib/preview-host";
describe("trusted Preview secret destination",()=>{
  const origin="https://newproject-verified.vercel.app";
  it("requires an independently recorded exact deployment origin",()=>{
    expect(trustedPreviewOrigin(origin,origin)).toBe(origin);
    for(const target of ["https://attacker.vercel.app","http://newproject-verified.vercel.app",`${origin}/redirect`,`${origin}?url=evil`,`https://user:password@newproject-verified.vercel.app`])expect(()=>trustedPreviewOrigin(target,origin)).toThrow();
    expect(()=>trustedPreviewOrigin(origin,undefined)).toThrow();
  });
});
