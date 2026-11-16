import { createHash } from "node:crypto";
import type { UiLocale } from "./ui-i18n";
export const LEGAL_ACCEPTANCE_TYPES=["terms_b2b","privacy_b2b","commercial_b2b","staff_confidentiality","traveller_submission_declaration"] as const;
export type LegalAcceptanceType=typeof LEGAL_ACCEPTANCE_TYPES[number];
export type LegalAcceptanceMethod="EXPLICIT_CHECKBOX"|"ACKNOWLEDGEMENT"|"SUBMISSION_DECLARATION";
export interface EvidenceVersion { id:string;version:number;body:string;locale:UiLocale }
export interface LegalEvidence {
  documentType:LegalAcceptanceType;legalVersionId:string;version:number;contentSha256:string;locale:UiLocale;
  userId:string|null;agencyId:string|null;acceptedAt:string;method:LegalAcceptanceMethod;
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function legalContentSha256(body:string):string {return createHash("sha256").update(body,"utf8").digest("hex");}
export function buildLegalEvidence(input:{documentType:LegalAcceptanceType;version:EvidenceVersion;userId:string|null;agencyId:string|null;acceptedAt:Date;method:LegalAcceptanceMethod}):LegalEvidence {
  const v=input.version,method=input.documentType==="privacy_b2b"?"ACKNOWLEDGEMENT":input.documentType==="traveller_submission_declaration"?"SUBMISSION_DECLARATION":"EXPLICIT_CHECKBOX";
  if(!LEGAL_ACCEPTANCE_TYPES.includes(input.documentType)||input.method!==method||!uuid.test(v.id)||!Number.isSafeInteger(v.version)||v.version<1||!v.body.trim()||v.body.length>50_000||!["en","fr","ar"].includes(v.locale)||!(input.acceptedAt instanceof Date)||!Number.isFinite(input.acceptedAt.getTime())||(input.userId!==null&&!uuid.test(input.userId))||(input.agencyId!==null&&!uuid.test(input.agencyId)))throw new Error("LEGAL_EVIDENCE_INVALID");
  return {documentType:input.documentType,legalVersionId:v.id,version:v.version,contentSha256:legalContentSha256(v.body),locale:v.locale,userId:input.userId,agencyId:input.agencyId,acceptedAt:input.acceptedAt.toISOString(),method:input.method};
}
export function legalAcceptanceRequired(kind:LegalAcceptanceType,current:EvidenceVersion,previous:LegalEvidence|null):boolean {
  return !previous||previous.documentType!==kind||previous.legalVersionId!==current.id||previous.version!==current.version||previous.locale!==current.locale||previous.contentSha256!==legalContentSha256(current.body);
}
