/** Conservative Traveller Hub policy; pure, no database or external services. */
export const HUB_BRANCH="codex/phase2d-traveller-hub-20261128";
export const CONSOLIDATED_BRANCH="codex/phase2c-document-intelligence-20261126";
export function consolidatedProductionEnabled(env:Record<string,string|undefined>=process.env){return env.VERCEL_ENV==="production"&&env.DATABASE_SCHEMA==="visa_os"&&env.VERCEL_GIT_COMMIT_REF===CONSOLIDATED_BRANCH}
export function hubEnabled(env:Record<string,string|undefined>=process.env){return consolidatedProductionEnabled(env)||env.VERCEL_ENV==="preview"&&(env.VERCEL_GIT_COMMIT_REF===HUB_BRANCH||env.VERCEL_GIT_COMMIT_REF===CONSOLIDATED_BRANCH)}
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
export type ReuseFile={id:string;typeId:string;code:string;name:string;mime:string;size:number;sourceReference:string;createdAt:string;programmeId:string;tripSpecific:boolean;vault?:boolean;automatic?:boolean};
/** Explicit catalogue aliases; preserve document type IDs and never infer eligibility from a label. */
export function canonicalPersonalCode(code:string):string{
 switch(code){
  case "COD-PASS":return "PASSPORT";
  case "DOC-ID-PHOTO":
  case "DOC-UZB-ICAO-PHOTO":return "PHOTO";
  case "DOC-REL":
  case "LEGACY-0987407aa51fe6db448d256a55321a9b":return "BANK_STATEMENT";
  case "DOC-EMPLOYMENT-OR-BUSINESS":
  case "LEGACY-455880d5b685eb5f7a3598ab704d90fc":return "EMPLOYMENT_CERT";
  default:return code;
 }
}
export function reusablePassport(input:{code:string;status:string;size:number;mime:string;sha256:string|null;expiry:string|null;today:string;latest:boolean;openRequest:boolean;attributable:boolean}){
 return canonicalPersonalCode(input.code)==="PASSPORT"&&input.status==="ACCEPTED"&&input.size>0&&input.size<=2*1024*1024&&["application/pdf","image/jpeg","image/png","image/webp"].includes(input.mime)&&/^[a-f0-9]{64}$/i.test(input.sha256??"")&&expiryState(input.expiry,input.today)==="valid"&&input.latest&&!input.openRequest&&input.attributable
}

export function validApplicationPassport(number:string|null|undefined,expiry:string|null|undefined,today:string){return (!(number??"").trim()||Boolean(passportKey(number)))&&expiryState(expiry??null,today)==="valid"}

export type TravellerSource=TravellerIdentity&{id:string;reference:string;reusable:ReuseFile[]};
export type TravellerMatch={id:string;name:string;nationality:string;reference:string;passport:string};
export function safeLookupTerm(q:unknown){const term=normalizedQuery(q);return term.length>=2?term:""}

export function sameDeclaredIdentity(a:TravellerIdentity,b:TravellerIdentity){return nameKey(a.name)===nameKey(b.name)&&a.nationality.trim().toUpperCase()===b.nationality.trim().toUpperCase()&&passportKey(a.passport)===passportKey(b.passport)&&a.expiry===b.expiry}

const REUSE_AGE_DAYS:Record<string,number>={PHOTO:180,PASSPORT_PHOTO:180,BANK_STATEMENT:30,EMPLOYMENT_CERT:30,MARRIAGE_CERT:90,MARRIAGE_CERTIFICATE:90,ACCOMMODATION_PROOF:30,FLIGHT_RESERVATION:30,HOTEL_RESERVATION:30,INSURANCE:30,INVITATION_LETTER:30};
export function tripSpecificDocument(code:string){return ["ACCOMMODATION_PROOF","FLIGHT_RESERVATION","HOTEL_RESERVATION","INSURANCE","INVITATION_LETTER"].includes(code)}
export function reusableDocument(input:Parameters<typeof reusablePassport>[0]&{uploadedAt:string}){
 const code=canonicalPersonalCode(input.code);
 if(code==="PASSPORT")return reusablePassport(input);
 if(input.status!=="ACCEPTED"||!input.latest||input.openRequest||!input.attributable||input.size<=0||input.size>2*1024*1024||!/^[a-f0-9]{64}$/i.test(input.sha256??"")||!["application/pdf","image/jpeg","image/png","image/webp","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(input.mime))return false;
 if(!Object.prototype.hasOwnProperty.call(REUSE_AGE_DAYS,code))return false;
 const age=(Date.parse(input.today+"T00:00:00Z")-Date.parse(input.uploadedAt.slice(0,10)+"T00:00:00Z"))/86400000;
 return Number.isFinite(age)&&age>=0&&age<=REUSE_AGE_DAYS[code]!;
}

export function renewalStage(expiry:string|null,today:string):"RENEW"|"URGENT"|"EXPIRED"|null{
 const state=expiryState(expiry,today);if(state==="expired")return "EXPIRED";if(state!=="renew"||!expiry)return null;
 return (Date.parse(expiry+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000<=30?"URGENT":"RENEW";
}

/** The independent vault is only activated on the consolidated branch. */
export function vaultEnabled(env:Record<string,string|undefined>=process.env){return consolidatedProductionEnabled(env)||env.VERCEL_ENV==="preview"&&env.VERCEL_GIT_COMMIT_REF===CONSOLIDATED_BRANCH}
export const PERSONAL_CODES=["PASSPORT","PHOTO","BANK_STATEMENT","EMPLOYMENT_CERT","MARRIAGE_CERT"] as const;
export function personalCode(code:string){return PERSONAL_CODES.some(c=>c===canonicalPersonalCode(code))}
export function autoEligible(input:Parameters<typeof reusablePassport>[0]&{issuedAt:string|null;uploadedAt:string;vault:boolean}){
 if(!personalCode(input.code)||!["UPLOADED","ACCEPTED"].includes(input.status)||!input.latest||input.openRequest||!input.attributable||input.size<=0||input.size>2*1024*1024||!/^[a-f0-9]{64}$/i.test(input.sha256??""))return false;
 if(canonicalPersonalCode(input.code)==="PASSPORT")return reusablePassport({...input,status:"ACCEPTED"});
 // Never infer freshness for time-sensitive documents from upload time.
 const date=input.issuedAt;
 if(!civilDate(date))return false;
 return reusableDocument({...input,status:"ACCEPTED",uploadedAt:date!});
}
export function autoPlan(options:ReuseFile[],required:string[],excluded:string[]=[]){
 const result:ReuseFile[]=[];
 for(const typeId of new Set(required)){if(excluded.includes(typeId))continue;const candidates=options.filter(d=>d.typeId===typeId&&d.automatic&&!d.tripSpecific).sort((a,b)=>Number(Boolean(b.vault))-Number(Boolean(a.vault))||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));if(candidates[0])result.push(candidates[0])}
 return result;
}

export function canConsolidate(a:TravellerIdentity&{dob:string|null},b:TravellerIdentity&{dob:string|null}){
 if(!passportKey(a.passport)||passportKey(a.passport)!==passportKey(b.passport)||nameKey(a.name)!==nameKey(b.name)||a.nationality!==b.nationality)return false;
 if(a.dob&&b.dob&&a.dob!==b.dob||a.expiry&&b.expiry&&a.expiry!==b.expiry)return false;
 return Boolean((civilDate(a.dob)&&a.dob===b.dob)||(civilDate(a.expiry)&&a.expiry===b.expiry));
}

export const directorySort=(v:unknown):"recent"|"name"|"expiry"=>v==="name"||v==="expiry"?v:"recent";
