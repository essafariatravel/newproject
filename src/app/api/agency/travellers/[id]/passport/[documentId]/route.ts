import {NextResponse} from "next/server";
import {getSessionUser} from "@/lib/auth";
import {isAgencyRole} from "@/lib/types";
import {hasPermission} from "@/lib/rbac";
import {repeatSource} from "@/lib/traveller-hub";
import {hubEnabled,uuid} from "@/lib/traveller-hub-policy";
import {GET as download} from "@/app/api/documents/[id]/route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const missing=()=>NextResponse.json({error:"Not found."},{status:404,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request,{params}:{params:Promise<{id:string;documentId:string}>}){
 if(!hubEnabled())return missing();
 const {id,documentId}=await params;
 if(!uuid(id)||!uuid(documentId))return missing();
 const user=await getSessionUser();
 if(!user||!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword||!hasPermission(user,"applications.create")||!hasPermission(user,"documents.upload.own"))return missing();
 try{
 const source=await repeatSource({...user,agencyId:user.agencyId},id);
 if(!source?.reusable.some(d=>d.id===documentId))return missing();
 return await download(request,{params:Promise.resolve({id:documentId})});
 }catch{return missing()}
}
