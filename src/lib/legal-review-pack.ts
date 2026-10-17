import { createHash } from "node:crypto";
import type { UiLocale } from "./ui-i18n";

export const REVIEW_DOCUMENT_SECTIONS = {
  legal_notice:"01", terms_b2b:"02", privacy_b2b:"03", cookies_b2b:"04", commercial_b2b:"05",
  agency_dpa:"06", staff_confidentiality:"07", ui_declarations:"08", publication_decisions:"09", official_sources:"10",
} as const;
export type ReviewDocument = keyof typeof REVIEW_DOCUMENT_SECTIONS;
export interface ReviewClause { id:string; title:string; body:string }
export interface ReviewSection { id:string; title:string; clauses:ReviewClause[] }
export interface LegalReviewPack {
  version:"1.0"; status:"REVIEW";
  locales:Record<UiLocale,{title:string;sourceSha256:string;sections:ReviewSection[]}>;
}
const locales=["en","fr","ar"] as const;
function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("LEGAL_REVIEW_PACK_INVALID");
  return value as Record<string,unknown>;
}
function text(value:unknown,max=50_000):string {
  if(typeof value!=="string"||!value.trim()||value.length>max)throw new Error("LEGAL_REVIEW_PACK_INVALID");
  return value;
}
/** Strict review-only input. This parser cannot create publication authority. */
export function parseLegalReviewPack(input:unknown):LegalReviewPack {
  const source=object(input),languages=object(source.locales);
  if(source.version!=="1.0"||source.status!=="REVIEW"||Object.keys(languages).sort().join()!=="ar,en,fr")throw new Error("LEGAL_REVIEW_PACK_INVALID");
  const parsed={} as LegalReviewPack["locales"];
  for(const locale of locales){
    const language=object(languages[locale]),sourceSha256=text(language.sourceSha256,64);
    if(!/^[a-f0-9]{64}$/.test(sourceSha256)||!Array.isArray(language.sections)||language.sections.length!==10)throw new Error("LEGAL_REVIEW_PACK_INVALID");
    const sections=language.sections.map((entry,index):ReviewSection=>{
      const section=object(entry),id=String(index+1).padStart(2,"0");
      if(section.id!==id||!Array.isArray(section.clauses)||!section.clauses.length)throw new Error("LEGAL_REVIEW_PACK_INVALID");
      const clauses=section.clauses.map((item,j):ReviewClause=>{
        const clause=object(item),clauseId=`${id}.${String(j+1).padStart(2,"0")}`;
        if(clause.id!==clauseId)throw new Error("LEGAL_REVIEW_PACK_INVALID");
        return {id:clauseId,title:text(clause.title,500),body:text(clause.body)};
      });
      return {id,title:text(section.title,500),clauses};
    });
    if(sections.flatMap(s=>s.clauses).length!==66)throw new Error("LEGAL_REVIEW_PACK_INVALID");
    parsed[locale]={title:text(language.title,500),sourceSha256,sections};
  }
  const identities=(locale:UiLocale)=>parsed[locale].sections.flatMap(s=>s.clauses.map(c=>c.id)).join();
  if(identities("fr")!==identities("en")||identities("fr")!==identities("ar"))throw new Error("LEGAL_REVIEW_TRANSLATION_STRUCTURE_MISMATCH");
  return {version:"1.0",status:"REVIEW",locales:parsed};
}
export function reviewDocument(pack:LegalReviewPack,kind:ReviewDocument,locale:UiLocale){
  if(!Object.hasOwn(REVIEW_DOCUMENT_SECTIONS,kind)||!locales.includes(locale))throw new Error("LEGAL_REVIEW_SELECTOR_INVALID");
  const sections=pack.locales[locale].sections.filter(s=>s.id===REVIEW_DOCUMENT_SECTIONS[kind]);
  const contentSha256=createHash("sha256").update(JSON.stringify({version:pack.version,kind,locale,sections})).digest("hex");
  return {kind,locale,direction:locale==="ar"?"rtl" as const:"ltr" as const,version:pack.version,status:pack.status,sections,contentSha256};
}
export function reviewPackReadiness(pack:LegalReviewPack){
  const unresolvedClauses=locales.flatMap(locale=>pack.locales[locale].sections.flatMap(s=>s.clauses.filter(c=>/\[[^\]]+\]/u.test(c.body)).map(c=>`${locale}:${c.id}`)));
  return {publishable:false as const,blockers:["COUNSEL_APPROVAL_REQUIRED","EFFECTIVE_DATE_REQUIRED",...(unresolvedClauses.length?["SOURCE_RESERVATIONS_UNRESOLVED"]:[])],unresolvedClauses};
}
/** Server metadata only; no browser parameter can enable this in Production. */
export function legalReviewEnabled(env:Record<string,string|undefined>=process.env):boolean {
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_TARGET_ENV) {
    return env.VERCEL === "1" && env.VERCEL_ENV === "preview" &&
      (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview") && env.DATABASE_SCHEMA === "visa_os_preview";
  }
  // Other hosted targets are not yet qualified. NODE_ENV alone is not proof
  // of a local destination, and cannot enable review on a Production schema.
  if (env.NETLIFY || env.CONTEXT || env.RENDER || env.CF_PAGES || env.WORKERS_CI ||
      (env.DATABASE_SCHEMA && env.DATABASE_SCHEMA !== "public")) return false;
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") return false;
  if (!env.DATABASE_URL) return true; // The existing development default is loopback.
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname); }
  catch { return false; }
}
