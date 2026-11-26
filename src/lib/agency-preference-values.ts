import { isValidNationality } from "@/lib/nationalities";
export const AGENCY_PREF_COOKIE="essafaria-agency-prefs";
export const PREF_SORTS=["recent","submitted","oldest","priority"] as const;
export type AgencyPrefs={nationality:string;sort:typeof PREF_SORTS[number];density:"standard"|"compact";favorites:string[]};
export const defaultPrefs:AgencyPrefs={nationality:"DZ",sort:"recent",density:"standard",favorites:[]};
export function cleanPrefs(value:unknown):AgencyPrefs {
 const v=value&&typeof value==="object"?value as Record<string,unknown>:{};
 return {nationality:typeof v.nationality==="string"&&isValidNationality(v.nationality)?v.nationality.trim().toUpperCase():"DZ",
 sort:PREF_SORTS.includes(v.sort as AgencyPrefs["sort"])?v.sort as AgencyPrefs["sort"]:"recent",
 density:v.density==="compact"?"compact":"standard",
 favorites:Array.isArray(v.favorites)?[...new Set(v.favorites.filter((x):x is string=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)))].slice(0,4):[]};
}
export function parsePrefs(raw:string|undefined,userId:string):AgencyPrefs {
 try{const parsed=JSON.parse(raw??"null");return parsed?.scope===userId?cleanPrefs(parsed):defaultPrefs}catch{return defaultPrefs}
}
export function prioritizeFavorites(favorites:string[],automatic:string[],available:string[]):string[]{
 const allowed=new Set(available);return [...new Set([...favorites,...automatic])].filter(id=>allowed.has(id)).slice(0,4);
}
