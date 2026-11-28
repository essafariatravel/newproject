import {NextResponse} from "next/server";
import {requireAgencyUser} from "@/lib/auth";
import {hasPermission} from "@/lib/rbac";
import {directory,repeatSource} from "@/lib/traveller-hub";
import {hubEnabled,safeLookupTerm,uuid,maskPassport} from "@/lib/traveller-hub-policy";
import {readRequestBodyLimited} from "@/lib/http-body";
export const dynamic="force-dynamic";
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!hubEnabled()||request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Not found"},404);
 try{
 const user=await requireAgencyUser();if(!hasPermission(user,"applicants.view.all")||!hasPermission(user,"applications.create"))return reply({error:"Forbidden"},403);
 const data=JSON.parse((await readRequestBodyLimited(request,2048)).toString("utf8"));
 if(data?.action==="search"){const q=safeLookupTerm(data.q);if(!q)return reply({rows:[]});const result=await directory(user,q,1,"all");return reply({rows:result.rows.slice(0,10).map(r=>({id:r.id,name:r.name,nationality:r.nationality,reference:r.reference,passport:maskPassport(r.passport)}))})}
 if(data?.action==="select"&&uuid(data.id)){const source=await repeatSource(user,data.id);return source?reply({source}):reply({error:"Not found"},404)}
 return reply({error:"Invalid request"},400);
 }catch{return reply({error:"Unavailable"},400)}
}
