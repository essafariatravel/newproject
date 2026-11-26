import {describe,it,expect} from "vitest";
import {cleanPrefs,parsePrefs,prioritizeFavorites} from "@/lib/agency-preference-values";
import {profileTab} from "@/app/portal/profile/profile-copy";
describe("agency partner centre preferences",()=>{
 it("isolates browser preferences by account",()=>{const raw=JSON.stringify({scope:"a",nationality:"FR",sort:"oldest",density:"compact"});expect(parsePrefs(raw,"a").nationality).toBe("FR");expect(parsePrefs(raw,"b").nationality).toBe("DZ")});
 it("rejects invalid preference data",()=>{expect(cleanPrefs({nationality:"ZZ",sort:"bad",density:"bad",favorites:["bad"]})).toEqual({nationality:"DZ",sort:"recent",density:"standard",favorites:[]})});
 it("prioritises only available destinations",()=>{expect(prioritizeFavorites(["c","x","b"],["a","b","d","e"],["a","b","c","d","e"])).toEqual(["c","b","a","d"])});
 it("accepts new tabs only by exact name",()=>{expect(profileTab("preferences")).toBe("preferences");expect(profileTab("support")).toBe("support");expect(profileTab("admin")).toBe("agency")});
});
