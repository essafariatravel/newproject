import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {scope,type Actor} from "@/lib/traveller-hub";
import {currentOperationActorPg} from "@/lib/operation-identity";
import {recordAuditPg} from "@/lib/audit";
import {AppError} from "@/lib/types";
import {vaultEnabled,canConsolidate,uuid} from "./traveller-hub-policy";
type Row={id:string;name:string;nationality:string;passport:string;expiry:string;dob:string|null;version:number;archived_at:Date|null;merged_into:string|null};
export async function changeTravellerLifecycle(user:Actor,input:{id:string;version:number;action:"archive"|"restore"|"merge";sourceId?:string;sourceVersion?:number}){
 const agency=scope(user);if(!vaultEnabled()||user.role!=="AGENCY_ADMIN"||!uuid(input.id)||!Number.isSafeInteger(input.version))throw new AppError("FORBIDDEN","Not allowed");
 const c=await pool.connect();try{await c.query("begin");const actor=await currentOperationActorPg(c,user);if(actor.role!=="AGENCY_ADMIN"||actor.agencyId!==agency)throw new AppError("FORBIDDEN","Not allowed");
 await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["traveller:"+agency]);
 const ids=[input.id,...(input.action==="merge"&&uuid(input.sourceId)&&input.sourceId!==input.id?[input.sourceId]:[])];
 const r=await c.query<Row>(`select id,full_name name,nationality,coalesce(passport_number,'') passport,coalesce(passport_expiry::text,'') expiry,date_of_birth::text dob,version,archived_at,merged_into from ${qt("traveller_profiles")} where agency_id=$1 and id=any($2::uuid[]) order by id for update`,[agency,ids]);
 const target=r.rows.find(x=>x.id===input.id);if(!target||target.version!==input.version||target.merged_into)throw new AppError("TRAVELLER_CHANGED","Profile changed");
 if(input.action==="merge"){
 const source=r.rows.find(x=>x.id===input.sourceId);if(!source||source.archived_at||target.archived_at||source.version!==input.sourceVersion||!canConsolidate(target,source))throw new AppError("TRAVELLER_CHANGED","Insufficient corroboration");
 // No merge when independent source documents or prior merged aliases exist; preserve every version and historical trail.
 const protectedSource=await c.query(`select 1 from ${qt("traveller_vault_files")} where agency_id=$1 and profile_id=$2 union all select 1 from ${qt("traveller_profiles")} where agency_id=$1 and merged_into=$2 union all select 1 from ${qt("traveller_visa_dates")} where agency_id=$1 and profile_id=$2 limit 1`,[agency,source.id]);if(protectedSource.rowCount)throw new AppError("TRAVELLER_CHANGED","Source has independent records");
 await c.query(`update ${qt("traveller_profile_links")} set profile_id=$3 where agency_id=$1 and profile_id=$2`,[agency,source.id,target.id]);
 await c.query(`update ${qt("traveller_profiles")} set archived_at=now(),merged_into=$3,version=version+1,updated_at=now() where agency_id=$1 and id=$2`,[agency,source.id,target.id]);
 await c.query(`update ${qt("traveller_profiles")} set version=version+1,updated_at=now() where agency_id=$1 and id=$2`,[agency,target.id]);
 }else{
 if(input.action==="archive"&&target.archived_at||input.action==="restore"&&!target.archived_at)throw new AppError("TRAVELLER_CHANGED","Profile changed");
 await c.query(`update ${qt("traveller_profiles")} set archived_at=case when $3::boolean then now() else null end,version=version+1,updated_at=now() where agency_id=$1 and id=$2`,[agency,target.id,input.action==="archive"]);
 }
 await recordAuditPg(c,{actor,agencyId:agency,action:"TRAVELLER_"+input.action.toUpperCase(),entity:"traveller_profile",entityId:target.id,metadata:input.action==="merge"?{sourceId:input.sourceId}:{}});await c.query("commit");return target.id;
 }catch(e){await c.query("rollback");throw e}finally{c.release()}
}
