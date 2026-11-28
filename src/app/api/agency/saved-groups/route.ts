import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {requireAgencyUser} from "@/lib/auth";
import {canAccessGroups} from "@/lib/group-access";
import {groupEnabled} from "@/lib/group-policy";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {currentOperationActorPg} from "@/lib/operation-identity";
import {recordAuditPg} from "@/lib/audit";
import {readRequestBodyLimited} from "@/lib/http-body";
import {cleanSavedGroup,parseSavedGroups,SAVED_GROUP_COOKIE,SAVED_GROUP_MAX,type SavedGroup} from "@/lib/saved-group-policy";
import {uuid} from "@/lib/traveller-hub-policy";
import {repeatSource} from "@/lib/traveller-hub";
export const dynamic="force-dynamic";
type Stored=SavedGroup&{version:number};
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!groupEnabled()||request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Unavailable"},404);
 try{
 const user=await requireAgencyUser();if(!canAccessGroups(user))return reply({error:"Forbidden"},403);
 const raw=JSON.parse((await readRequestBodyLimited(request,4096)).toString("utf8"));
 if(!["list","load","save","remove","import"].includes(raw?.action))return reply({error:"Invalid"},400);
 const mutating=["save","remove","import"].includes(raw.action),agency=user.agencyId,c=await pool.connect();
 let load:Stored|undefined;
 try{
 await c.query("begin");
 const actor=await currentOperationActorPg(c,user,mutating?"write":"read");
 if(!canAccessGroups(actor)||actor.agencyId!==agency){await c.query("rollback");return reply({error:"Forbidden"},403)}
 if(mutating)await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["saved-groups:"+agency]);
 const list=async()=>(await c.query<Stored>(`select id,label,profiles,version from ${qt("saved_traveller_groups")} where agency_id=$1 order by updated_at desc,id limit $2`,[agency,SAVED_GROUP_MAX])).rows;
 const groups=await list();
 const valid=async(g:SavedGroup)=>(await c.query(`select id from ${qt("traveller_profiles")} where agency_id=$1 and id=any($2::uuid[]) and archived_at is null`,[agency,g.profiles])).rows.length===g.profiles.length;
 const conflict=async()=>{await c.query("rollback");return reply({error:"Changed"},409)};
 if(raw.action==="load"){
 load=uuid(raw.id)?groups.find(g=>g.id===raw.id):undefined;
 if(!load||!await valid(load))return await conflict();
 }else if(raw.action==="save"){
 const g=cleanSavedGroup(raw.group);if(!g||!await valid(g))return await conflict();
 const old=groups.find(x=>x.id===g.id);
 if(old?raw.group.version!==old.version:raw.group.version!==undefined||groups.length>=SAVED_GROUP_MAX)return await conflict();
 if(old){await c.query(`update ${qt("saved_traveller_groups")} set label=$3,profiles=$4::uuid[],version=version+1,updated_at=now() where agency_id=$1 and id=$2`,[agency,g.id,g.label,g.profiles]);}
 else await c.query(`insert into ${qt("saved_traveller_groups")}(agency_id,id,label,profiles) values($1,$2,$3,$4::uuid[])`,[agency,g.id,g.label,g.profiles]);
 await recordAuditPg(c,{actor,agencyId:agency,action:old?"SAVED_GROUP_UPDATED":"SAVED_GROUP_CREATED",entity:"saved_group",entityId:g.id});
 }else if(raw.action==="remove"){
 const old=uuid(raw.id)?groups.find(g=>g.id===raw.id):undefined;if(!old||old.version!==raw.version)return await conflict();
 await c.query(`delete from ${qt("saved_traveller_groups")} where agency_id=$1 and id=$2`,[agency,old.id]);
 await recordAuditPg(c,{actor,agencyId:agency,action:"SAVED_GROUP_REMOVED",entity:"saved_group",entityId:old.id});
 }else if(raw.action==="import"){
 const local=parseSavedGroups((await cookies()).get(SAVED_GROUP_COOKIE)?.value,user.id,agency);
 let count=groups.length;
 for(const g of local){if(count>=SAVED_GROUP_MAX)break;if(groups.some(x=>x.id===g.id)||!await valid(g))continue;
 await c.query(`insert into ${qt("saved_traveller_groups")}(agency_id,id,label,profiles) values($1,$2,$3,$4::uuid[])`,[agency,g.id,g.label,g.profiles]);
 await recordAuditPg(c,{actor,agencyId:agency,action:"SAVED_GROUP_IMPORTED",entity:"saved_group",entityId:g.id});count++}
 }
 const next=mutating?await list():groups;await c.query("commit");
 if(raw.action!=="load")return reply({groups:next});
 }catch(e){await c.query("rollback").catch(()=>{});throw e}finally{c.release()}
 if(!load)return reply({error:"Unavailable"},404);
 const sources=await Promise.all(load.profiles.map(id=>repeatSource(user,id)));
 return sources.every(Boolean)?reply({sources}):reply({error:"Unavailable"},409);
 }catch{return reply({error:"Unavailable"},400)}
}
