import {CONSOLIDATED_BRANCH,passportKey} from "./traveller-hub-policy";
export const GROUP_MIN=2,GROUP_MAX=5,GROUP_FILES_MAX=30,GROUP_BYTES_MAX=24*1024*1024;
export function groupEnabled(env:Record<string,string|undefined>=process.env){return env.VERCEL_ENV==="preview"&&env.VERCEL_GIT_COMMIT_REF===CONSOLIDATED_BRANCH&&env.DATABASE_SCHEMA==="visa_os_preview"}
export function distinctGroupIdentities(rows:readonly {passportNumber?:string|null;travellerProfileId?:string}[]){
 const passports=rows.map(r=>passportKey(r.passportNumber)),ids=rows.flatMap(r=>r.travellerProfileId?[r.travellerProfileId]:[]);
 return passports.every(Boolean)&&new Set(passports).size===rows.length&&new Set(ids).size===ids.length;
}
export function sharedDocumentCode(code:string){return ["ACCOMMODATION_PROOF","FLIGHT_RESERVATION","HOTEL_RESERVATION","INVITATION_LETTER"].includes(code)}
export function groupWithinBudget(count:number,files:number,bytes:number){return Number.isSafeInteger(count)&&count>=GROUP_MIN&&count<=GROUP_MAX&&Number.isSafeInteger(files)&&files>=0&&files<=GROUP_FILES_MAX&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=GROUP_BYTES_MAX}
export function groupMoney(value:string|number,count:number){const s=String(value);if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(s)||!Number.isSafeInteger(count)||count<0||count>GROUP_MAX)return null;const [a,b=""]=s.split(".");return Number(a)*100*count+Number(b.padEnd(2,"0"))*count}

export function groupDocumentConflict(files:readonly {member:number;code:string;sha256:string}[]){const groups=new Map<string,{members:Set<number>;personal:boolean}>();for(const f of files){const g=groups.get(f.sha256)??{members:new Set<number>(),personal:false};g.members.add(f.member);if(!sharedDocumentCode(f.code))g.personal=true;groups.set(f.sha256,g)}return [...groups.values()].some(g=>g.personal&&g.members.size>1)}

/** Capacity includes untouched placeholder rows, not a partially entered traveller. */
export function groupRosterCapacity(rows:readonly {untouched:boolean}[]){return Math.max(0,GROUP_MAX-rows.length+rows.filter(r=>r.untouched).length)}

/** Read-model only. Individual case statuses remain authoritative. */
export type GroupTrackingRow={terminal:boolean;status:string;attention:boolean};
export function groupProgress(rows:readonly GroupTrackingRow[],expected:number){
 const closed=rows.filter(r=>r.terminal||["APPROVED","COMPLETED","CANCELLED","REJECTED","REFUSED"].includes(r.status)).length;
 const action=rows.filter(r=>!r.terminal&&!["APPROVED","COMPLETED","CANCELLED","REJECTED","REFUSED"].includes(r.status)&&r.attention).length;
 return {closed,action,active:rows.length-closed,complete:expected>=GROUP_MIN&&rows.length===expected&&closed===expected,consistent:expected>=GROUP_MIN&&expected<=GROUP_MAX&&rows.length===expected};
}
export function groupTrackingFilter(v:unknown):"all"|"attention"|"active"|"closed"{return v==="attention"||v==="active"||v==="closed"?v:"all"}
export function groupTrackingPage(v:unknown){const n=typeof v==="string"&&/^\d{1,5}$/.test(v)?Number(v):1;return Math.max(1,Math.min(10000,n))}
export function groupReuseReady(ids:readonly (string|null)[],expected:number){return expected>=GROUP_MIN&&expected<=GROUP_MAX&&ids.length===expected&&ids.every(id=>Boolean(id))&&new Set(ids).size===expected}
