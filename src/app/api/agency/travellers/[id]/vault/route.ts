import {NextResponse} from "next/server";
import {requireAgencyUser} from "@/lib/auth";
import {readRequestBodyLimited} from "@/lib/http-body";
import {vaultSave} from "@/lib/traveller-vault";
import {vaultEnabled,uuid} from "@/lib/traveller-hub-policy";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!vaultEnabled()||request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Not found"},{status:404});
 try{const user=await requireAgencyUser();const {id}=await params;const url=new URL(request.url),type=url.searchParams.get("type"),version=Number(url.searchParams.get("version"));
 if(!uuid(id)||!uuid(type))return NextResponse.json({error:"Invalid request"},{status:400});
 const name=decodeURIComponent(request.headers.get("x-file-name")??""),mime=request.headers.get("content-type")??"";
 const data=await readRequestBodyLimited(request,2097152);
 const result=await vaultSave(user,id,type,version,{name,type:mime,data},url.searchParams.get("issued"));
 return NextResponse.json({id:result},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to save document"},{status:400})}
}
