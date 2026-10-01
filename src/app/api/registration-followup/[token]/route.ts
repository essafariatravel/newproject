import { NextResponse } from "next/server";
import { resolveRegistrationFollowup, uploadRegistrationFollowup } from "@/lib/registration-followup";
import { REGISTRATION_MAX_UPLOAD_BYTES, AppError } from "@/lib/types";
import type { RegistrationDocumentCategory } from "@/lib/registration-constants";
export const dynamic = "force-dynamic";
const responseHeaders = {"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token} = await params;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({error:"Invalid request."},{status:403,headers:responseHeaders});
  const resolved = await resolveRegistrationFollowup(token);
  if (!resolved || !request.body) return NextResponse.json({error:"Link unavailable."},{status:404,headers:responseHeaders});
  const reader = request.body.getReader();
  const chunks:Uint8Array[]=[]; let size=0;
  const limit = REGISTRATION_MAX_UPLOAD_BYTES+64*1024;
  try {
    while(true) {const chunk=await reader.read(); if(chunk.done) break;size+=chunk.value.length;if(size>limit){await reader.cancel();return NextResponse.json({error:"File too large."},{status:413,headers:responseHeaders});}chunks.push(chunk.value);}
    const body=Buffer.concat(chunks);
    const parsed=await new Request(request.url,{method:"POST",headers:{"content-type":request.headers.get("content-type")??""},body}).formData();
    const slotId=String(parsed.get("slotId")??""); const file=parsed.get("file");
    const slot=resolved.slots.find((value)=>value.id===slotId);
    if(!slot || !(file instanceof File)) return NextResponse.json({error:"Invalid document request."},{status:400,headers:responseHeaders});
    await uploadRegistrationFollowup({token,slotId,file:{category:slot.category as RegistrationDocumentCategory,name:file.name,type:file.type,size:file.size,data:Buffer.from(await file.arrayBuffer())}});
    return NextResponse.json({received:true},{headers:responseHeaders});
  } catch(error) { return NextResponse.json({error:"Could not accept document."},{status:error instanceof AppError && error.code==="INVALID_LINK" ? 404 : 400,headers:responseHeaders}); }
}
