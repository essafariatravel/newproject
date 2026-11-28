import {NextResponse} from "next/server";
import {requireAgencyUser} from "@/lib/auth";
import {vaultRead} from "@/lib/traveller-vault";
import {vaultEnabled,uuid} from "@/lib/traveller-hub-policy";
import {listRequirementsForVisaType} from "@/lib/requests";
import {downloadContentDisposition} from "@/lib/download-content-disposition";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string;fileId:string}>}){
 try{if(!vaultEnabled())throw Error("Unavailable");const user=await requireAgencyUser();const {id,fileId}=await params;const programme=new URL(request.url).searchParams.get("programme");
 if(programme!==null&&!uuid(programme))throw Error("Unavailable");
 const r=await vaultRead(user,id,fileId,programme!==null);
 if(programme&&!(await listRequirementsForVisaType(programme)).some(x=>x.documentTypeId===r.typeId))throw Error("Unavailable");
 return new NextResponse(new Uint8Array(r.data),{headers:{"Content-Type":r.mime,"Content-Length":String(r.size),"Content-Disposition":downloadContentDisposition(r.filename),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"Not found"},{status:404,headers:{"Cache-Control":"private, no-store"}})}
}
