import type { AgencyPrefs } from "@/lib/agency-preference-values";
export function preferencesChanged(a:AgencyPrefs,b:AgencyPrefs){return a.nationality!==b.nationality||a.sort!==b.sort||a.density!==b.density||a.favorites.join("|")!==b.favorites.join("|")}
export function moveFavorite(ids:string[],id:string,offset:-1|1){const i=ids.indexOf(id),j=i+offset;if(i<0||j<0||j>=ids.length)return ids;const next=[...ids];[next[i],next[j]]=[next[j]!,next[i]!];return next}
export function profileSearch(value:string,query:string){const normalize=(v:string)=>v.normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase().trim();return normalize(value).includes(normalize(query))}
export function visibleActivity<T extends {kind:"login"|"account"}>(events:T[],filter:"all"|"login"|"account",expanded:boolean){return events.filter(e=>filter==="all"||e.kind===filter).slice(0,expanded?12:3)}
export function missingContactFields(contact:{phone:string;city:string;addressLine:string}){return (["phone","city","addressLine"] as const).filter(k=>!contact[k].trim())}
