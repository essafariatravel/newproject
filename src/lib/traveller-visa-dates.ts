import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {scope,type Actor} from "./traveller-hub";
import {hasPermission} from "@/lib/rbac";
import {currentOperationActorPg} from "@/lib/operation-identity";
import {recordAuditPg} from "@/lib/audit";
import {getDecisionDocuments} from "@/lib/applications";
import {officialDocumentIntegritySql} from "@/lib/decision-integrity";
import {configuredStorageProvider} from "@/lib/storage-config";
import {AppError} from "@/lib/types";
import {vaultEnabled,uuid,civilDate} from "./traveller-hub-policy";
export async function travellerVisas(user:Actor,profileId:string){
 const agency=scope(user);if(!vaultEnabled()||!hasPermission(user,"documents.view.all")||!uuid(profileId))return [];
 const rows=await pool.query<{id:string;country_name:string;reference:string}>(`select a.id,a.country_name,a.reference from ${qt("applications")} a join ${qt("statuses")} s on s.id=a.status_id and s.code='APPROVED' join ${qt("applicants")} t on t.application_id=a.id join ${qt("traveller_profile_links")} l on l.applicant_id=t.id and l.agency_id=a.agency_id where a.agency_id=$1 and l.profile_id=$2 and (select count(*) from ${qt("applicants")} x where x.application_id=a.id)=1 order by a.decision_at desc nulls last limit 20`,[agency,profileId]);
 const dates=await pool.query<{document_id:string;valid_from:string;valid_until:string;version:number}>(`select document_id,valid_from::text,valid_until::text,version from ${qt("traveller_visa_dates")} where agency_id=$1 and profile_id=$2`,[agency,profileId]);
 const byId=new Map(dates.rows.map(x=>[x.document_id,x]));
 const groups=await Promise.all(rows.rows.map(async a=>(await getDecisionDocuments(a.id)).filter(d=>d.typeCode==="DECISION_VISA_APPROVAL").map(d=>({id:d.id,country:a.country_name,reference:a.reference,filename:d.originalFilename,date:byId.get(d.id)??null}))));
 return groups.flat().slice(0,40);
}
export async function saveVisaDates(user:Actor,input:{profileId:string;documentId:string;from:string;until:string;version:number}){
 const agency=scope(user);if(!vaultEnabled()||user.role!=="AGENCY_ADMIN"||!hasPermission(user,"documents.view.all")||!uuid(input.profileId)||!uuid(input.documentId)||configuredStorageProvider()!=="db")throw new AppError("FORBIDDEN","Unavailable");
 const from=civilDate(input.from),until=civilDate(input.until);if(!from||!until||until<from||!Number.isSafeInteger(input.version)||input.version<0)throw new AppError("VALIDATION","Invalid dates");
 const c=await pool.connect();try{await c.query("begin");const actor=await currentOperationActorPg(c,user);if(actor.agencyId!==agency||actor.role!=="AGENCY_ADMIN")throw new AppError("FORBIDDEN","Unavailable");
 const r=await c.query(`select d.id from ${qt("documents")} d join ${qt("document_blobs")} b on b.key=d.storage_key join ${qt("document_types")} dt on dt.id=d.document_type_id and dt.code='DECISION_VISA_APPROVAL' join ${qt("applications")} a on a.id=d.application_id join ${qt("statuses")} s on s.id=a.status_id and s.code='APPROVED' join ${qt("applicants")} t on t.application_id=a.id join ${qt("traveller_profile_links")} l on l.applicant_id=t.id and l.agency_id=a.agency_id join ${qt("traveller_profiles")} p on p.id=l.profile_id and p.agency_id=l.agency_id where a.agency_id=$1 and l.profile_id=$2 and d.id=$3 and p.archived_at is null and a.decision_at is not null and (select count(*) from ${qt("applicants")} x where x.application_id=a.id)=1 and ${officialDocumentIntegritySql("d","b")} for update of p,d`,[agency,input.profileId,input.documentId]);if(!r.rowCount)throw new AppError("NOT_FOUND","Unavailable");
 const result=input.version===0?await c.query(`insert into ${qt("traveller_visa_dates")}(agency_id,profile_id,document_id,valid_from,valid_until) values($1,$2,$3,$4::date,$5::date) on conflict do nothing`,[agency,input.profileId,input.documentId,from,until]):await c.query(`update ${qt("traveller_visa_dates")} set valid_from=$4::date,valid_until=$5::date,version=version+1,updated_at=now() where agency_id=$1 and profile_id=$2 and document_id=$3 and version=$6`,[agency,input.profileId,input.documentId,from,until,input.version]);if(result.rowCount!==1)throw new AppError("TRAVELLER_CHANGED","Dates changed");
 await recordAuditPg(c,{actor,agencyId:agency,action:"TRAVELLER_VISA_DATES_DECLARED",entity:"document",entityId:input.documentId,metadata:{profileId:input.profileId,from,until}});await c.query("commit");
 }catch(e){await c.query("rollback");throw e}finally{c.release()}
}
