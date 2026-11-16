import { describe, expect, it } from "vitest";
import { parseLegalReviewPack, reviewDocument, reviewPackReadiness, legalReviewEnabled } from "@/lib/legal-review-pack";

const fixture = () => ({ version:"1.0", status:"REVIEW", locales:Object.fromEntries((["fr","en","ar"] as const).map(locale=>[locale,{title:locale,sourceSha256:"a".repeat(64),sections:Array.from({length:10},(_,i)=>({id:String(i+1).padStart(2,"0"),title:`Section ${i+1}`,clauses:Array.from({length:i===0?12:6},(_,j)=>({id:`${String(i+1).padStart(2,"0")}.${String(j+1).padStart(2,"0")}`,title:`Clause ${j+1}`,body:locale==="ar"?"نص للمراجعة القانونية فقط":"Working draft for legal review only"}))}))}])) });

describe("private trilingual owner legal review pack",()=>{
 it("preserves stable ten-section / 66-clause identities across all three languages",()=>{
  const pack=parseLegalReviewPack(fixture());
  for(const locale of ["fr","en","ar"] as const){expect(pack.locales[locale].sections).toHaveLength(10);expect(pack.locales[locale].sections.flatMap(s=>s.clauses)).toHaveLength(66);}
  expect(reviewDocument(pack,"legal_notice","fr").sections[0]!.id).toBe("01");
  expect(reviewDocument(pack,"terms_b2b","en").sections[0]!.id).toBe("02");
  expect(reviewDocument(pack,"privacy_b2b","ar").direction).toBe("rtl");
  expect(reviewDocument(pack,"commercial_b2b","fr").contentSha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it.each(["PUBLISHED","APPROVED","DRAFT"])('does not turn supplied status %s into publication authority',status=>{expect(()=>parseLegalReviewPack({...fixture(),status})).toThrow();});
 it("rejects missing/duplicated languages, sections or clause identities",()=>{
  const p=fixture();delete p.locales.ar;expect(()=>parseLegalReviewPack(p)).toThrow();
  const q=fixture();q.locales.en!.sections[0]!.id="02";expect(()=>parseLegalReviewPack(q)).toThrow();
  const r=fixture();r.locales.ar!.sections[0]!.clauses[0]!.id="99.99";expect(()=>parseLegalReviewPack(r)).toThrow();
 });
 it("detects placeholders, including Arabic, and never certifies a review pack for publication",()=>{
  const p=fixture();p.locales.ar!.sections[0]!.clauses[0]!.body="المسؤول [الاسم يحتاج إلى تأكيد]";
  const readiness=reviewPackReadiness(parseLegalReviewPack(p));expect(readiness.publishable).toBe(false);expect(readiness.unresolvedClauses).toContain("ar:01.01");expect(readiness.blockers).toContain("COUNSEL_APPROVAL_REQUIRED");
 });
 it("changes the content digest when any displayed clause, title or locale changes",()=>{
  const p=parseLegalReviewPack(fixture()),before=reviewDocument(p,"legal_notice","fr").contentSha256;
  p.locales.fr.sections[0]!.clauses[0]!.body+=" revised";expect(reviewDocument(p,"legal_notice","fr").contentSha256).not.toBe(before);
  expect(reviewDocument(p,"legal_notice","ar").contentSha256).not.toBe(before);
 });
 it("rejects unexpected document selectors and oversized or malformed content",()=>{
  expect(()=>reviewDocument(parseLegalReviewPack(fixture()),"../../private" as never,"fr")).toThrow();
  const p=fixture();p.locales.fr!.sections[0]!.clauses[0]!.body="x".repeat(50001);expect(()=>parseLegalReviewPack(p)).toThrow();
 });
 it("enables private review only locally or in explicit Preview, never Production or ambiguous hosted environments",()=>{
  expect(legalReviewEnabled({NODE_ENV:"development"})).toBe(true);
  expect(legalReviewEnabled({NODE_ENV:"production"})).toBe(false);
  const p={VERCEL:"1",VERCEL_ENV:"preview",DATABASE_SCHEMA:"visa_os_preview"};expect(legalReviewEnabled(p)).toBe(true);
  expect(legalReviewEnabled({...p,VERCEL_TARGET_ENV:"production"})).toBe(false);
  expect(legalReviewEnabled({...p,VERCEL_ENV:"production"})).toBe(false);
  expect(legalReviewEnabled({...p,DATABASE_SCHEMA:"visa_os"})).toBe(false);
  expect(legalReviewEnabled({VERCEL:"1",NODE_ENV:"development"})).toBe(false);
  expect(legalReviewEnabled({NODE_ENV:"development",VERCEL_ENV:"production"})).toBe(false);
  expect(legalReviewEnabled({NODE_ENV:"development",NETLIFY:"true"})).toBe(false);
  expect(legalReviewEnabled({NODE_ENV:"development",DATABASE_SCHEMA:"visa_os"})).toBe(false);
  expect(legalReviewEnabled({NODE_ENV:"development",DATABASE_URL:"postgresql://postgres:fixture@remote.invalid/production"})).toBe(false);
 });
});
