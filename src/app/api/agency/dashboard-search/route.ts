import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { pool } from "@/lib/db";
import { qualifiedTable as table } from "@/lib/database-schema";
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
  // Literal substring match, tenant ID comes exclusively from authenticated session.
  // Return only summary fields, no passport numbers, file metadata or other tenant data.
  const result=await pool.query<{id:string;reference:string;name:string;status_code:string;status_name:string}>(`
   select a.id,a.reference,coalesce(nullif(p.full_name,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),'—') as name,s.code as status_code,s.name as status_name
   from ${table("applications")} a join ${table("statuses")} s on s.id=a.status_id
   left join lateral (select full_name,first_name,last_name from ${table("applicants")} where application_id=a.id limit 1) p on true
   where a.agency_id=$1 and (strpos(lower(a.reference),lower($2))>0 or strpos(lower(a.country_name),lower($2))>0 or strpos(lower(a.visa_type_name),lower($2))>0 or strpos(lower(coalesce(nullif(p.full_name,''),concat_ws(' ',p.first_name,p.last_name))),lower($2))>0)
   order by (lower(a.reference)=lower($2)) desc,a.created_at desc,a.id desc limit 5
  `,[user.agencyId,q]);
  const locale=await getUiLocale();
  return NextResponse.json({items:result.rows.map(r=>({id:r.id,title:r.name,detail:r.reference+" · "+localizedStatusName(r.status_code,r.status_name,locale),href:"/portal/applications/"+r.id,kind:"case",aliases:[]}))},{headers});
 }catch{console.warn("Dashboard search unavailable");return NextResponse.json({error:"Unavailable"},{status:503,headers});}
}
