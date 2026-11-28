import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {currentOperationActorPg} from "@/lib/operation-identity";
import {recordAuditPg} from "@/lib/audit";
import {hasPermission} from "@/lib/rbac";
import {AppError,type AuthUser} from "@/lib/types";
import {fileNameProblem} from "@/lib/filename";
import {validateDocumentFormat} from "@/lib/upload-validation";
import {sha256Hex,assertStoredFileIntegrity} from "@/lib/file-integrity";
import {vaultEnabled,uuid,personalCode,canonicalPersonalCode,vaultStorageFits,passportKey,civilDate,nameKey,autoEligible,type ReuseFile} from "./traveller-hub-policy";
import {algeriaToday} from "./travel-deadline";
type Actor=AuthUser&{agencyId:string};
function authorize(u:Actor,write=false){if(!vaultEnabled()||!uuid(u.agencyId)||u.mustChangePassword||u.userStatus!=="ACTIVE"||u.agencyStatus!=="ACTIVE"||!["AGENCY_ADMIN","AGENCY_USER"].includes(u.role)||!hasPermission(u,"applicants.view.all")||!hasPermission(u,"documents.view.all")||(write&&(!hasPermission(u,"documents.upload.own")||!hasPermission(u,"applications.create"))))throw new AppError("FORBIDDEN","Vault access denied");return u.agencyId}
type Row={profile_id:string;id:string;type_id:string;code:string;label:string;filename:string;mime:string;size:number;sha256:string;issued_at:string|null;created_at:Date;version:number;latest:boolean;identity_name:string;identity_nationality:string;identity_passport:string;identity_expiry:string;name:string;nationality:string;passport:string;expiry:string|null;archived_at:Date|null};
const projection=()=>`select v.profile_id,v.id,v.type_id,dt.code,dt.name label,v.original_filename filename,v.mime_type mime,v.size_bytes size,v.sha256,v.issued_at::text issued_at,v.created_at,v.version,
 not exists(select 1 from ${qt("traveller_vault_files")} n where n.agency_id=v.agency_id and n.profile_id=v.profile_id and n.type_id=v.type_id and n.version>v.version) latest,
 v.identity_name,v.identity_nationality,v.identity_passport,v.identity_expiry::text identity_expiry,p.full_name name,p.nationality,coalesce(p.passport_number,'') passport,p.passport_expiry::text expiry,p.archived_at
 from ${qt("traveller_vault_files")} v join ${qt("traveller_profiles")} p on p.id=v.profile_id and p.agency_id=v.agency_id join ${qt("document_types")} dt on dt.id=v.type_id
 where v.agency_id=$1 and v.profile_id=$2 and dt.active and dt.agency_uploadable`;
function eligible(r:Row){return Boolean(!r.archived_at&&passportKey(r.passport)&&passportKey(r.passport)===r.identity_passport&&nameKey(r.name)===nameKey(r.identity_name)&&r.nationality===r.identity_nationality&&r.expiry===r.identity_expiry&&autoEligible({code:r.code,status:"UPLOADED",size:r.size,mime:r.mime,sha256:r.sha256,expiry:r.expiry,today:algeriaToday(),latest:r.latest,openRequest:false,attributable:true,issuedAt:r.issued_at,uploadedAt:r.created_at.toISOString(),vault:true}))}
export async function vaultList(user:Actor,id:string){const agency=authorize(user);if(!uuid(id))throw new AppError("NOT_FOUND","Not found");
 const r=await pool.query<Row>(projection()+" order by v.version desc,v.created_at desc limit 100",[agency,id]);
 return r.rows.map(x=>({id:x.id,type_id:x.type_id,code:x.code,label:x.label,filename:x.filename,mime:x.mime,size:x.size,created_at:x.created_at,issued_at:x.issued_at,version:x.version,latest:x.latest,reusable:eligible(x)}));
}
export async function vaultOptions(user:Actor,id:string):Promise<ReuseFile[]>{
 if(!vaultEnabled())return [];
 const rows=await vaultList(user,id);
 return rows.filter(r=>r.reusable).map(r=>({id:r.id,typeId:r.type_id,code:r.code,name:r.filename,mime:r.mime,size:r.size,sourceReference:"Vault",createdAt:r.created_at.toISOString(),programmeId:"",tripSpecific:false,vault:true,automatic:true}));
}
export async function vaultTypes(user:Actor){authorize(user,true);const r=await pool.query<{id:string;code:string;name:string;name_fr:string|null;name_ar:string|null}>(`select id,code,name,name_fr,name_ar from ${qt("document_types")} where active and agency_uploadable order by sort_order,name`);return r.rows.filter(x=>personalCode(x.code))}
export async function vaultSave(user:Actor,id:string,typeId:string,version:number,file:{name:string;type:string;data:Buffer},issuedAt:string|null){
 const agency=authorize(user,true);if(!uuid(id)||!uuid(typeId)||!Number.isSafeInteger(version)||version<1||file.data.length<1||file.data.length>2097152||!file.name||file.name.length>200||Boolean(fileNameProblem(file.name))||/[\x00-\x1f]/.test(file.name))throw new AppError("VALIDATION","Invalid document");
 validateDocumentFormat(file);const date=civilDate(issuedAt);if(issuedAt&&(!date||date>algeriaToday()))throw new AppError("VALIDATION","Invalid issue date");
 const c=await pool.connect();try{await c.query("begin");const actor=await currentOperationActorPg(c,user);if(actor.agencyId!==agency)throw new AppError("FORBIDDEN","Vault access denied");authorize({...actor,agencyId:agency},true);
 const profile=await c.query<{full_name:string;nationality:string;passport_number:string;passport_expiry:string}>(`select full_name,nationality,passport_number,passport_expiry::text from ${qt("traveller_profiles")} where id=$1 and agency_id=$2 and version=$3 and archived_at is null for update`,[id,agency,version]);
 const a=profile.rows[0];if(!a||!passportKey(a.passport_number)||!civilDate(a.passport_expiry))throw new AppError("TRAVELLER_CHANGED","Complete or refresh passport details");
 const t=await c.query<{code:string}>(`select code from ${qt("document_types")} where id=$1 and active and agency_uploadable`,[typeId]);const code=t.rows[0]?.code;if(!code||!personalCode(code)||(canonicalPersonalCode(code)!=="PASSPORT"&&!date))throw new AppError("VALIDATION","Invalid type");
 const sha=sha256Hex(file.data);
 const prior=await c.query<{id:string;version:number;sha256:string;issued_at:string|null;identity_passport:string;identity_expiry:string;identity_name:string;identity_nationality:string}>(`select id,version,sha256,issued_at::text,identity_passport,identity_expiry::text,identity_name,identity_nationality from ${qt("traveller_vault_files")} where agency_id=$1 and profile_id=$2 and type_id=$3 order by version desc limit 1`,[agency,id,typeId]);
 const old=prior.rows[0];if(old&&old.sha256===sha&&old.issued_at===date&&old.identity_passport===passportKey(a.passport_number)&&old.identity_expiry===a.passport_expiry&&old.identity_name===a.full_name&&old.identity_nationality===a.nationality){await c.query("commit");return old.id}
 // Bound storage and history in both environments; do not silently delete any version.
 await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["traveller-vault-budget"]);const budget=await c.query<{global:string;agency:string;database:string}>(`select coalesce(sum(size_bytes),0)::text "global",coalesce(sum(size_bytes) filter(where agency_id=$1),0)::text agency,pg_database_size(current_database())::text "database" from ${qt("traveller_vault_files")}`,[agency]);const usage=budget.rows[0];if(!usage||!vaultStorageFits({global:Number(usage.global),agency:Number(usage.agency),database:Number(usage.database)},file.data.length))throw new AppError("VAULT_CAPACITY","Vault storage capacity reached");
 const cap=await c.query<{n:number}>(`select count(*)::int n from ${qt("traveller_vault_files")} where agency_id=$1 and profile_id=$2`,[agency,id]);if((cap.rows[0]?.n??0)>=50)throw new AppError("VAULT_CAPACITY","Vault limit reached");
 const result=await c.query<{id:string}>(`insert into ${qt("traveller_vault_files")}(agency_id,profile_id,type_id,version,original_filename,mime_type,size_bytes,sha256,data,issued_at,identity_name,identity_nationality,identity_passport,identity_expiry) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14::date) returning id`,[agency,id,typeId,(old?.version??0)+1,file.name,file.type,file.data.length,sha,file.data,date,a.full_name,a.nationality,passportKey(a.passport_number),a.passport_expiry]);
 const key=result.rows[0]!.id;await recordAuditPg(c,{actor,agencyId:agency,action:"TRAVELLER_VAULT_SAVED",entity:"traveller_vault",entityId:key,metadata:{profileId:id,typeId}});await c.query("commit");return key;
 }catch(e){await c.query("rollback");throw e}finally{c.release()}
}
export async function vaultRead(user:Actor,id:string,fileId:string,forReuse=false){
 const agency=authorize(user,forReuse);if(!uuid(id)||!uuid(fileId))throw new AppError("NOT_FOUND","Not found");const c=await pool.connect();
 try{await c.query("begin");const actor=await currentOperationActorPg(c,user,"read");if(actor.agencyId!==agency)throw new AppError("FORBIDDEN","Vault access denied");authorize({...actor,agencyId:agency},forReuse);
 const r=await c.query<Row>(projection()+" and v.id=$3",[agency,id,fileId]);const row=r.rows[0];if(!row||forReuse&&!eligible(row))throw new AppError("NOT_FOUND","Not found");
 const b=await c.query<{data:Buffer}>(`select data from ${qt("traveller_vault_files")} where agency_id=$1 and profile_id=$2 and id=$3`,[agency,id,fileId]);const data=b.rows[0]?.data;if(!data)throw new AppError("NOT_FOUND","Not found");
 assertStoredFileIntegrity({data,expectedSizeBytes:row.size,expectedSha256:row.sha256});
 await recordAuditPg(c,{actor,agencyId:agency,action:"TRAVELLER_VAULT_READ",entity:"traveller_vault",entityId:fileId,metadata:{profileId:id,reuse:forReuse}});await c.query("commit");return {data,filename:row.filename,mime:row.mime,size:row.size,typeId:row.type_id};
 }catch(e){await c.query("rollback");throw e}finally{c.release()}
}

/** Bounded single query for directory metadata. No file content or identity data returned to the browser. */
export async function vaultDirectorySummary(user:Actor,ids:string[]){
 const agency=authorize(user);const keys=[...new Set(ids.filter(uuid))].slice(0,20);
 const result:Record<string,{stored:number;eligible:number;passport:boolean;photo:boolean}>={};
 if(!keys.length)return result;
 const r=await pool.query<Row>(projection().replace("v.profile_id=$2","v.profile_id=any($2::uuid[])")+` and not exists(select 1 from ${qt("traveller_vault_files")} n where n.agency_id=v.agency_id and n.profile_id=v.profile_id and n.type_id=v.type_id and n.version>v.version)`,[agency,keys]);
 for(const row of r.rows){const item=result[row.profile_id]??={stored:0,eligible:0,passport:false,photo:false};item.stored++;if(eligible(row)){item.eligible++;if(canonicalPersonalCode(row.code)==="PASSPORT")item.passport=true;if(canonicalPersonalCode(row.code)==="PHOTO")item.photo=true}}
 return result;
}
