import {describe,it,expect} from "vitest";
import {preferencesChanged,moveFavorite,profileSearch,visibleActivity,missingContactFields} from "@/app/portal/profile/profile-r03-utils";
import {defaultPrefs} from "@/lib/agency-preference-values";
describe("R03 partner centre",()=>{
 it("detects changed order and settings",()=>{expect(preferencesChanged(defaultPrefs,{...defaultPrefs})).toBe(false);expect(preferencesChanged({...defaultPrefs,favorites:["a","b"]},{...defaultPrefs,favorites:["b","a"]})).toBe(true);expect(preferencesChanged(defaultPrefs,{...defaultPrefs,density:"compact"})).toBe(true)});
 it("moves only valid favourites without mutating input",()=>{const ids=["a","b","c"];expect(moveFavorite(ids,"b",-1)).toEqual(["b","a","c"]);expect(moveFavorite(ids,"a",-1)).toEqual(ids);expect(moveFavorite(ids,"x",1)).toEqual(ids);expect(ids).toEqual(["a","b","c"])});
 it("searches accents and Arabic",()=>{expect(profileSearch("Émirats arabes unis","emirats")).toBe(true);expect(profileSearch("الجزائر","الجزائر")).toBe(true);expect(profileSearch("France","Chine")).toBe(false)});
 it("keeps activity chronological and limits initial view",()=>{const events=Array.from({length:12},(_,i)=>({i,kind:i===0?"account" as const:"login" as const}));expect(visibleActivity(events,"all",false)).toHaveLength(3);expect(visibleActivity(events,"login",true)).toHaveLength(11);expect(visibleActivity(events,"account",false).map(e=>e.i)).toEqual([0])});
 it("shows only missing contact fields",()=>{expect(missingContactFields({phone:"123",city:" ",addressLine:""})).toEqual(["city","addressLine"])});
});
