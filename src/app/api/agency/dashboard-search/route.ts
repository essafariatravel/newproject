import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { searchApplications } from "@/lib/queries";
import { readRequestBodyLimited } from "@/lib/http-body";
import { getUiLocale,localizedStatusName } from "@/lib/ui-i18n";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const user=await getSessionUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 if(user.mustChangePassword||!user.agencyId||!isAgencyRole(user.role))return NextResponse.json({error:"Forbidden"},{status:403,headers});
 let q:string;
 try{const input:unknown=JSON.parse((await readRequestBodyLimited(request,2048)).toString("utf8"));if(!input||typeof input!=="object"||!("q" in input)||typeof input.q!=="string")throw Error("query");q=input.q.trim();if(q.length<3||q.length>80)return NextResponse.json({items:[]},{headers});}
 catch{return NextResponse.json({error:"Invalid query"},{status:400,headers});}
 try{
  // Escape LIKE wildcard syntax; existing shared search applies agencyId from the session.
  const result=await searchApplications(user,{q:q.replace(/[\\%_]/g,"\\$&"),page:1,pageSize:20});
  const locale=await getUiLocale();
  return NextResponse.json({items:result.rows.slice(0,5).map(r=>({id:r.app.id,title:r.applicantSummary,detail:r.app.reference+" · "+localizedStatusName(r.statusCode,r.statusName,locale),href:"/portal/applications/"+r.app.id,kind:"case",aliases:[]}))},{headers});
 }catch{console.warn("Dashboard search unavailable");return NextResponse.json({error:"Unavailable"},{status:503,headers});}
}
