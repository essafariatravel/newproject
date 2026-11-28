/** Conservative Traveller Hub policy; pure, no database or external services. */
export const HUB_BRANCH="codex/phase2d-traveller-hub-20261128";
export function hubEnabled(env:Record<string,string|undefined>=process.env){return env.VERCEL_ENV==="preview"&&env.VERCEL_GIT_COMMIT_REF===HUB_BRANCH}
export const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const nameKey=(v:string)=>v.trim().replace(/\s+/g," ").toLowerCase();
export const passportKey=(v:string|null|undefined)=>{const s=(v??"").trim().toUpperCase();return /^[A-Z0-9]{6,20}$/.test(s)&&/[0-9]/.test(s)&&!/^([A-Z0-9])\1+$/.test(s)?s:""};
export function civilDate(v:string|null|undefined):string|null{if(!v||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const t=Date.parse(v+"T00:00:00Z");return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v?v:null}
export function minimumExpiry(today:string):string|null{if(!civilDate(today))return null;const [y,m,d]=today.split("-").map(Number);const x=new Date(Date.UTC(y!,m!-1+7,1));x.setUTCDate(Math.min(d!,new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate()));return x.toISOString().slice(0,10)}
export function expiryState(expiry:string|null,today:string){const e=civilDate(expiry),min=minimumExpiry(today);return !e||!min?"unknown":e<=today?"expired":e<min?"renew":"valid"}
export function maskPassport(v:string|null){const k=passportKey(v);return k?"•••• "+k.slice(-4):"—"}
export function normalizedQuery(v:unknown){return typeof v==="string"?v.trim().slice(0,100):""}
export function pageNumber(v:unknown){const n=Number(v);return Number.isSafeInteger(n)&&n>=1?Math.min(n,10000):1}
export type TravellerIdentity={name:string;nationality:string;passport:string;expiry:string};
export function identityMatches(a:TravellerIdentity,b:TravellerIdentity){return Boolean(passportKey(a.passport)&&passportKey(a.passport)===passportKey(b.passport)&&nameKey(a.name)===nameKey(b.name)&&a.nationality.trim().toUpperCase()===b.nationality.trim().toUpperCase()&&civilDate(a.expiry)&&a.expiry===b.expiry)}
export type ReuseFile={id:string;typeId:string;code:string;name:string;mime:string;size:number;sourceReference:string;createdAt:string;programmeId:string;tripSpecific:boolean};
export function reusablePassport(input:{code:string;status:string;size:number;mime:string;sha256:string|null;expiry:string|null;today:string;latest:boolean;openRequest:boolean;attributable:boolean}){
 return input.code==="PASSPORT"&&input.status==="ACCEPTED"&&input.size>0&&input.size<=2*1024*1024&&["application/pdf","image/jpeg","image/png","image/webp"].includes(input.mime)&&/^[a-f0-9]{64}$/i.test(input.sha256??"")&&expiryState(input.expiry,input.today)==="valid"&&input.latest&&!input.openRequest&&input.attributable
}

export function validApplicationPassport(number:string|null|undefined,expiry:string|null|undefined,today:string){return (!(number??"").trim()||Boolean(passportKey(number)))&&expiryState(expiry??null,today)==="valid"}

export type TravellerSource=TravellerIdentity&{id:string;reference:string;reusable:ReuseFile[]};
export type TravellerMatch={id:string;name:string;nationality:string;reference:string;passport:string};
export function safeLookupTerm(q:unknown){const term=normalizedQuery(q);return term.length>=2?term:""}

export function sameDeclaredIdentity(a:TravellerIdentity,b:TravellerIdentity){return nameKey(a.name)===nameKey(b.name)&&a.nationality.trim().toUpperCase()===b.nationality.trim().toUpperCase()&&passportKey(a.passport)===passportKey(b.passport)&&a.expiry===b.expiry}

const REUSE_AGE_DAYS:Record<string,number>={PHOTO:180,PASSPORT_PHOTO:180,BANK_STATEMENT:30,EMPLOYMENT_CERT:30,MARRIAGE_CERT:90,MARRIAGE_CERTIFICATE:90,ACCOMMODATION_PROOF:30,FLIGHT_RESERVATION:30,HOTEL_RESERVATION:30,INSURANCE:30,INVITATION_LETTER:30};
export function tripSpecificDocument(code:string){return ["ACCOMMODATION_PROOF","FLIGHT_RESERVATION","HOTEL_RESERVATION","INSURANCE","INVITATION_LETTER"].includes(code)}
export function reusableDocument(input:Parameters<typeof reusablePassport>[0]&{uploadedAt:string}){
 if(input.code==="PASSPORT")return reusablePassport(input);
 if(input.status!=="ACCEPTED"||!input.latest||input.openRequest||!input.attributable||input.size<=0||input.size>2*1024*1024||!/^[a-f0-9]{64}$/i.test(input.sha256??"")||!["application/pdf","image/jpeg","image/png","image/webp","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(input.mime))return false;
 if(!Object.prototype.hasOwnProperty.call(REUSE_AGE_DAYS,input.code))return false;
 const age=(Date.parse(input.today+"T00:00:00Z")-Date.parse(input.uploadedAt.slice(0,10)+"T00:00:00Z"))/86400000;
 return Number.isFinite(age)&&age>=0&&age<=REUSE_AGE_DAYS[input.code]!;
}

export function renewalStage(expiry:string|null,today:string):"RENEW"|"URGENT"|"EXPIRED"|null{
 const state=expiryState(expiry,today);if(state==="expired")return "EXPIRED";if(state!=="renew"||!expiry)return null;
 return (Date.parse(expiry+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000<=30?"URGENT":"RENEW";
}
