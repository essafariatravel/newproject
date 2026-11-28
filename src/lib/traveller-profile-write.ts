import "server-only";
import type {PoolClient} from "pg";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {currentOperationActorPg} from "@/lib/operation-identity";
import {recordAuditPg} from "@/lib/audit";
import {AppError,type AuthUser} from "@/lib/types";
import {isValidNationality} from "@/lib/nationalities";
import {hasPermission} from "@/lib/rbac";
import {scope,type Actor} from "./traveller-hub";
import {hubEnabled,uuid,passportKey,civilDate,sameDeclaredIdentity,vaultEnabled,nameKey} from "./traveller-hub-policy";
type Fields={name:string;nationality:string;passport?:string;expiry?:string;dob?:string};
function validated(f:Fields){const name=f.name.trim(),nationality=f.nationality.trim().toUpperCase(),passport=passportKey(f.passport),expiry=civilDate(f.expiry),dob=civilDate(f.dob);if(dob&&dob>new Date().toISOString().slice(0,10))throw new AppError("VALIDATION","Invalid birth date");if(!name||name.length>200||!isValidNationality(nationality)||(f.passport?.trim()&&!passport)||(f.expiry&&!expiry)||(f.dob&&!dob))throw new AppError("VALIDATION","Invalid profile");return {name,nationality,passport:passport||null,expiry,dob}}
async function lock(c:PoolClient,agency:string){await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["traveller:"+agency])}
async function checkDuplicate(c:PoolClient,agency:string,passport:string|null,nationality:string,id?:string){if(!passport)return;const r=await c.query(`select 1 from ${qt("traveller_profiles")} where agency_id=$1 and nationality=$2 and upper(trim(passport_number))=$3 and ($4::uuid is null or id<>$4) ${vaultEnabled()?"and merged_into is null":""} limit 1`,[agency,nationality,passport,id??null]);if(r.rowCount)throw new AppError("TRAVELLER_DUPLICATE","Select existing traveller")}
export async function saveTraveller(user:Actor,fields:Fields,id?:string,version?:number){
 const agency=scope(user);if(!hasPermission(user,"applications.create"))throw new AppError("FORBIDDEN","Forbidden");const f=validated(fields);const c=await pool.connect();
 try{await c.query("begin");const actor=await currentOperationActorPg(c,user);await lock(c,agency);
 let row:{id:string}|undefined;
 if(id){
 if(!uuid(id)||!Number.isSafeInteger(version))throw new AppError("VALIDATION","Invalid profile");
 const old=await c.query<{passport_number:string|null;nationality:string;full_name:string;date_of_birth:string|null}>(`select passport_number,nationality,full_name,date_of_birth::text from ${qt("traveller_profiles")} where agency_id=$1 and id=$2 and version=$3 ${vaultEnabled()?"and archived_at is null":""} for update`,[agency,id,version]);if(!old.rows[0])throw new AppError("TRAVELLER_CHANGED","Profile changed");
 if(vaultEnabled()&&(nameKey(old.rows[0].full_name)!==nameKey(f.name)||old.rows[0].nationality!==f.nationality||(old.rows[0].date_of_birth&&old.rows[0].date_of_birth!==f.dob))){const evidence=await c.query(`select 1 from ${qt("traveller_profile_links")} where agency_id=$1 and profile_id=$2 union all select 1 from ${qt("traveller_vault_files")} where agency_id=$1 and profile_id=$2 limit 1`,[agency,id]);if(evidence.rowCount)throw new AppError("TRAVELLER_CHANGED","Identity correction requires review");}
 if(old.rows[0].passport_number!==f.passport||old.rows[0].nationality!==f.nationality)await checkDuplicate(c,agency,f.passport,f.nationality,id);
 const r=await c.query<{id:string}>(`update ${qt("traveller_profiles")} set full_name=$3,nationality=$4,passport_number=$5,passport_expiry=$6::date,date_of_birth=$7::date,version=version+1,updated_at=now() where agency_id=$1 and id=$2 and version=$8 returning id`,[agency,id,f.name,f.nationality,f.passport,f.expiry,f.dob,version]);row=r.rows[0];
 }else{await checkDuplicate(c,agency,f.passport,f.nationality);const r=await c.query<{id:string}>(`insert into ${qt("traveller_profiles")}(agency_id,full_name,nationality,passport_number,passport_expiry,date_of_birth) values($1,$2,$3,$4,$5::date,$6::date) returning id`,[agency,f.name,f.nationality,f.passport,f.expiry,f.dob]);row=r.rows[0]}
 if(!row)throw new AppError("TRAVELLER_CHANGED","Profile changed");
 await recordAuditPg(c,{actor,agencyId:agency,action:id?"TRAVELLER_PROFILE_UPDATED":"TRAVELLER_PROFILE_CREATED",entity:"traveller_profile",entityId:row.id});await c.query("commit");return row.id;
 }catch(e){await c.query("rollback");throw e}finally{c.release()}
}
export async function linkTravellerInSubmission(c:PoolClient,actor:AuthUser,applicantId:string,fields:Fields,selectedId?:string){
 if(!hubEnabled()||!actor.agencyId)return;
 const agency=actor.agencyId,f=validated(fields);await lock(c,agency);
 let id=selectedId;
 if(id){
 const r=await c.query<{name:string;nationality:string;passport:string;expiry:string}>(`select full_name name,nationality,coalesce(passport_number,'') passport,coalesce(passport_expiry::text,'') expiry from ${qt("traveller_profiles")} where agency_id=$1 and id=$2 ${vaultEnabled()?"and archived_at is null":""} for update`,[agency,id]);
 if(!r.rows[0]||!sameDeclaredIdentity({name:f.name,nationality:f.nationality,passport:f.passport??"",expiry:f.expiry??""},r.rows[0]))throw new AppError("TRAVELLER_CHANGED","Profile changed");
 }else{
 await checkDuplicate(c,agency,f.passport,f.nationality);
 const r=await c.query<{id:string}>(`insert into ${qt("traveller_profiles")}(agency_id,full_name,nationality,passport_number,passport_expiry) values($1,$2,$3,$4,$5::date) returning id`,[agency,f.name,f.nationality,f.passport,f.expiry]);id=r.rows[0]!.id;
 }
 const r=await c.query(`insert into ${qt("traveller_profile_links")}(applicant_id,agency_id,profile_id) select t.id,a.agency_id,$3::uuid from ${qt("applicants")} t join ${qt("applications")} a on a.id=t.application_id where t.id=$1 and a.agency_id=$2`,[applicantId,agency,id]);if(r.rowCount!==1)throw new AppError("FORBIDDEN","Profile linkage denied");
 await recordAuditPg(c,{actor,agencyId:agency,action:"TRAVELLER_PROFILE_LINKED",entity:"traveller_profile",entityId:id,metadata:{applicantId}});
}
