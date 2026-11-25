import {NextResponse} from "next/server";
import {getSessionUser} from "@/lib/auth";
import {isAgencyRole} from "@/lib/types";
import {readRequestBodyLimited} from "@/lib/http-body";
import {countAgencyCases} from "@/lib/queries";
import {caseQueryFilters,queueFilters} from "@/app/portal/applications/case-workspace";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 if(!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const sp:Record<string,string|undefined>={};
 try{const body=JSON.parse((await readRequestBodyLimited(request,4096)).toString("utf8"));for(const k of ["q","status","from","to","country","sort","missing","focus","queue","documents"])if(typeof body?.[k]==="string")sp[k]=body[k].slice(0,160)}catch{return NextResponse.json({error:"Invalid query"},{status:400,headers})}
 if(sp.from&&sp.to&&sp.from>sp.to)return NextResponse.json({error:"Invalid period"},{status:400,headers});
 const queue=sp.documents==="requested"?"attention":sp.queue==="active"?"active":sp.queue==="completed"?"completed":"all";
 try{const start=performance.now();const total=await countAgencyCases(user,{...caseQueryFilters(sp),...queueFilters(queue)});return NextResponse.json({total},{headers:{...headers,"Server-Timing":`case_count;dur=${Math.round(performance.now()-start)}`}})}catch{return NextResponse.json({error:"Unavailable"},{status:503,headers})}
}
