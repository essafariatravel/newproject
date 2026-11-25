import {NextResponse} from "next/server";
import {getSessionUser} from "@/lib/auth";
import {isAgencyRole} from "@/lib/types";
import {readRequestBodyLimited} from "@/lib/http-body";
import {searchCaseSuggestions} from "@/lib/queries";
import {getUiLocale,localizedStatusName} from "@/lib/ui-i18n";
import {caseQueryFilters,queueFilters} from "@/app/portal/applications/case-workspace";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 if(!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const sp:Record<string,string|undefined>={};
 try{const body=JSON.parse((await readRequestBodyLimited(request,4096)).toString("utf8"));if(typeof body.q!=="string"||body.q.trim().length<3||body.q.length>80)return NextResponse.json({items:[]},{headers});for(const k of ["status","from","to","country","sort","missing","focus","queue","documents"])if(typeof body.filters?.[k]==="string")sp[k]=body.filters[k].slice(0,160);sp.q=body.q.trim()}catch{return NextResponse.json({error:"Invalid query"},{status:400,headers})}
 try{const started=performance.now();const queue=sp.documents==="requested"?"attention":sp.queue==="active"?"active":sp.queue==="completed"?"completed":"all";const [result,locale]=await Promise.all([searchCaseSuggestions(user,{...caseQueryFilters(sp),...queueFilters(queue)}),getUiLocale()]);return NextResponse.json({items:result.map(r=>({id:r.id,title:r.applicantSummary??"—",detail:r.reference+" · "+localizedStatusName(r.statusCode,r.statusName,locale),href:"/portal/applications/"+r.id,aliases:[]}))},{headers:{...headers,"Server-Timing":`case_search;dur=${Math.round(performance.now()-started)}`}})}catch{return NextResponse.json({error:"Unavailable"},{status:503,headers})}
}
