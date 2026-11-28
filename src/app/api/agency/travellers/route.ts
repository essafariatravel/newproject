import {saveVisaDates} from "@/lib/traveller-visa-dates";
import {changeTravellerLifecycle} from "@/lib/traveller-lifecycle";
import {saveTraveller} from "@/lib/traveller-profile-write";
import {z} from "zod";
import {AppError} from "@/lib/types";
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
 const user=await requireAgencyUser();if(!hasPermission(user,"applicants.view.all"))return reply({error:"Forbidden"},403);
 const data=JSON.parse((await readRequestBodyLimited(request,2048)).toString("utf8"));
 if(data?.action!=="directorySearch"&&!hasPermission(user,"applications.create"))return reply({error:"Forbidden"},403);
 if(data?.action==="directorySearch"){const q=safeLookupTerm(data.q);if(!q)return reply({rows:[]});const result=await directory(user,q,1,data.filter,data.sort);return reply({rows:result.rows.slice(0,6).map(r=>({id:r.id,name:r.name,nationality:r.nationality,reference:r.reference,passport:maskPassport(r.passport)}))})}
 if(data?.action==="visaDates"){const f=z.object({profileId:z.string().uuid(),documentId:z.string().uuid(),from:z.string().max(10),until:z.string().max(10),version:z.number().int().min(0)}).parse(data);await saveVisaDates(user,f);return reply({id:f.documentId});}
 if(["archive","restore","merge"].includes(data?.action)){const f=z.object({action:z.enum(["archive","restore","merge"]),id:z.string().uuid(),version:z.number().int().positive(),sourceId:z.string().uuid().optional(),sourceVersion:z.number().int().positive().optional()}).parse(data);return reply({id:await changeTravellerLifecycle(user,f)});}
 if(data?.action==="create"||data?.action==="update"){const f=z.object({name:z.string().max(200),nationality:z.string().max(80),passport:z.string().max(20).optional(),expiry:z.string().max(10).optional(),dob:z.string().max(10).optional(),id:z.string().uuid().optional(),version:z.number().int().positive().optional()}).parse(data);if(data.action==="update"&&(!f.id||!f.version))return reply({error:"Invalid request"},400);return reply({id:await saveTraveller(user,f,data.action==="update"?f.id:undefined,f.version)});}
 if(data?.action==="search"){const q=safeLookupTerm(data.q);if(!q)return reply({rows:[]});const result=await directory(user,q,1,"all");return reply({rows:result.rows.slice(0,10).map(r=>({id:r.id,name:r.name,nationality:r.nationality,reference:r.reference,passport:maskPassport(r.passport)}))})}
 if(data?.action==="select"&&uuid(data.id)){const source=await repeatSource(user,data.id);return source?reply({source}):reply({error:"Not found"},404)}
 return reply({error:"Invalid request"},400);
 }catch(e){return reply({error:"Unavailable",code:e instanceof AppError?e.code:"VALIDATION"},400)}
}
