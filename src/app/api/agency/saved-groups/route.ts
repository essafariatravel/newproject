import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {requireAgencyUser} from "@/lib/auth";
import {canAccessGroups} from "@/lib/group-access";
import {groupEnabled} from "@/lib/group-policy";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {readRequestBodyLimited} from "@/lib/http-body";
import {cleanSavedGroup,parseSavedGroups,savedGroupPayload,SAVED_GROUP_COOKIE,SAVED_GROUP_MAX} from "@/lib/saved-group-policy";
import {uuid} from "@/lib/traveller-hub-policy";
import {repeatSource} from "@/lib/traveller-hub";
export const dynamic="force-dynamic";
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!groupEnabled()||request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Unavailable"},404);
 try{
 const user=await requireAgencyUser();if(!canAccessGroups(user))return reply({error:"Forbidden"},403);
 const raw=JSON.parse((await readRequestBodyLimited(request,4096)).toString("utf8"));
 const jar=await cookies(),groups=parseSavedGroups(jar.get(SAVED_GROUP_COOKIE)?.value,user.id,user.agencyId);
 if(raw?.action==="list")return reply({groups});
 if(raw?.action==="load"&&uuid(raw.id)){
 const g=groups.find(x=>x.id===raw.id);if(!g)return reply({error:"Unavailable"},404);
 const sources=await Promise.all(g.profiles.map(id=>repeatSource(user,id)));
 if(!sources.every(Boolean))return reply({error:"Unavailable"},409);
 return reply({sources});
 }
 let next=groups;
 if(raw?.action==="save"){
 const g=cleanSavedGroup(raw.group);if(!g)return reply({error:"Invalid"},400);
 const r=await pool.query<{id:string}>(`select id from ${qt("traveller_profiles")} where agency_id=$1 and id=any($2::uuid[]) and archived_at is null`,[user.agencyId,g.profiles]);
 if(r.rows.length!==g.profiles.length)return reply({error:"Unavailable"},409);
 if(!groups.some(x=>x.id===g.id)&&groups.length>=SAVED_GROUP_MAX)return reply({error:"Capacity"},409);
 next=[g,...groups.filter(x=>x.id!==g.id)];
 }else if(raw?.action==="remove"&&uuid(raw.id)){next=groups.filter(x=>x.id!==raw.id);}
 else return reply({error:"Invalid"},400);
 const res=reply({groups:next});
 res.cookies.set(SAVED_GROUP_COOKIE,savedGroupPayload(user.id,user.agencyId,next),{httpOnly:true,secure:true,sameSite:"strict",path:"/api/agency/saved-groups",maxAge:180*24*60*60});
 return res;
 }catch{return reply({error:"Unavailable"},400)}
}
