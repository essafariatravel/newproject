import {listRequirementsForVisaType} from "@/lib/requests";
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
 const {id,documentId}=await params;const programme=new URL(request.url).searchParams.get("programme");
 if(!uuid(id)||!uuid(documentId)||!uuid(programme))return missing();
 const user=await getSessionUser();
 if(!user||!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword||!hasPermission(user,"applications.create")||!hasPermission(user,"documents.upload.own"))return missing();
 try{
 const source=await repeatSource({...user,agencyId:user.agencyId},id);
 const doc=source?.reusable.find(d=>d.id===documentId);if(!doc||doc.tripSpecific&&doc.programmeId!==programme)return missing();
 const requirements=await listRequirementsForVisaType(programme);if(!requirements.some(r=>r.documentTypeId===doc.typeId))return missing();
 return await download(request,{params:Promise.resolve({id:documentId})});
 }catch{return missing()}
}
