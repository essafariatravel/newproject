import {NextResponse} from "next/server";
import {getSessionUser} from "@/lib/auth";
import {isAgencyRole} from "@/lib/types";
import {getApplicationDetail} from "@/lib/queries";
import {getDecisionDocuments} from "@/lib/applications";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 if(user.mustChangePassword||!user.agencyId||!isAgencyRole(user.role))return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const {id}=await params;const detail=await getApplicationDetail(id,user);
 if(!detail)return NextResponse.json({error:"Not found"},{status:404,headers});
 if(!["APPROVED","REJECTED"].includes(detail.statusCode))return NextResponse.json({files:[]},{headers});
 try{const verified=await getDecisionDocuments(id);return NextResponse.json({files:verified.map(d=>({id:d.id,name:d.originalFilename,mime:d.mimeType}))},{headers})}
 catch{return NextResponse.json({error:"Unavailable"},{status:503,headers})}
}
