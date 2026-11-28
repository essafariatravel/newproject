import {uuid} from "./traveller-hub-policy";
import {GROUP_MIN,GROUP_MAX} from "./group-policy";
export const SAVED_GROUP_COOKIE="essafaria-saved-groups";
export const SAVED_GROUP_MAX=6;
export type SavedGroup={id:string;label:string;profiles:string[]};
export function cleanSavedGroup(value:unknown):SavedGroup|null{
 if(!value||typeof value!=="object")return null;
 const v=value as Record<string,unknown>;
 if(!uuid(v.id)||typeof v.label!=="string"||!Array.isArray(v.profiles))return null;
 const label=v.label.trim().replace(/\s+/g," ");
 if(!label||label.length>40||/[\u0000-\u001f\u007f]/.test(label)||v.profiles.length<GROUP_MIN||v.profiles.length>GROUP_MAX||!v.profiles.every(uuid))return null;
 const profiles=v.profiles.map(x=>x.toLowerCase());
 if(new Set(profiles).size!==profiles.length)return null;
 return {id:v.id.toLowerCase(),label,profiles};
}
export function parseSavedGroups(raw:string|undefined,userId:string,agencyId:string):SavedGroup[]{
 try{const v=JSON.parse(raw??"null");if(v?.user!==userId||v?.agency!==agencyId||!Array.isArray(v.groups))return [];
 const items:SavedGroup[]=[],seen=new Set<string>();
 for(const item of v.groups.slice(0,SAVED_GROUP_MAX)){const g=cleanSavedGroup(item);if(g&&!seen.has(g.id)){seen.add(g.id);items.push(g)}}return items;
 }catch{return []}
}
export function savedGroupPayload(user:string,agency:string,groups:SavedGroup[]){
 const value=JSON.stringify({user,agency,groups});
 // Cookie encoding adds overhead; enforce a conservative browser cookie budget.
 if(encodeURIComponent(value).length>3600)throw Error("Saved group capacity");
 return value;
}
