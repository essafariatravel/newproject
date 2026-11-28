import {NextResponse} from "next/server";
import {z} from "zod";
import {requireAgencyUser} from "@/lib/auth";
import {canAccessGroups} from "@/lib/group-access";
import {pool,db} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {currentOperationActor} from "@/lib/operation-identity";
import {readRequestBodyLimited} from "@/lib/http-body";
import {groupEnabled,GROUP_MAX,groupWithinBudget} from "@/lib/group-policy";
import {submitVisaGroup,type SubmitVisaRequestInput} from "@/lib/requests";
import {resolveRequestUploads,clearRequestUploads} from "@/lib/request-uploads";
import {sha256Hex} from "@/lib/file-integrity";
import {AppError} from "@/lib/types";
import {requestErrorMessage} from "@/lib/request-feedback";
import {getUiLocale} from "@/lib/ui-i18n";
import {revalidatePath} from "next/cache";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const schema=z.object({id:uuid,visaTypeId:uuid,countryId:uuid,expectedFee:z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),expectedCatalogue:hash,members:z.array(z.object({attempt:uuid,profileId:uuid.optional(),name:z.string().trim().min(1).max(200),nationality:z.string().max(80),passport:z.string().max(20),expiry:z.string().max(10),files:z.array(z.object({token:z.string().regex(/^[0-9a-f-]{36}\/[012]$/i),sha256:hash})).max(30)})).min(2).max(GROUP_MAX)});
async function receipt(agency:string,id:string,manifest?:string){
 const g=await pool.query<{manifest:string;member_count:number}>(`select manifest,member_count from ${qt("visa_request_groups")} where agency_id=$1 and id=$2`,[agency,id]);
 if(!g.rows[0])return null;if(manifest&&manifest!==g.rows[0].manifest)throw new AppError("VALIDATION","Attempt already used");
 const r=await pool.query<{applicationId:string;reference:string}>(`select a.id "applicationId",a.reference from ${qt("visa_request_group_members")} m join ${qt("applications")} a on a.id=m.application_id and a.agency_id=m.agency_id where m.agency_id=$1 and m.group_id=$2 order by m.position`,[agency,id]);
 if(r.rows.length!==g.rows[0].member_count)throw new AppError("INTERNAL","Receipt incomplete");return r.rows;
}
export async function POST(request:Request){
 if(!groupEnabled()||request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Unavailable"},404);
 try{const actor=await requireAgencyUser();if(!canAccessGroups(actor))throw new AppError("FORBIDDEN","Unavailable");
 await db.transaction(async tx=>{await currentOperationActor(tx,actor,"read")});
 const raw=JSON.parse((await readRequestBodyLimited(request,65536)).toString("utf8"));
 if(raw?.action==="receipt"){const id=uuid.parse(raw.id);return reply({applications:await receipt(actor.agencyId,id)})}
 const input=schema.parse(raw);if(!groupWithinBudget(input.members.length,input.members.reduce((n,m)=>n+m.files.length,0),0))throw new AppError("VALIDATION","Group limit");
 const manifest=sha256Hex(Buffer.from(JSON.stringify(input)));
 const old=await receipt(actor.agencyId,input.id,manifest);if(old)return reply({applications:old});
 const inputs:SubmitVisaRequestInput[]=[];let bytes=0;
 for(const m of input.members){const docs=await resolveRequestUploads(actor,m.attempt,input.visaTypeId,m.files.map(f=>f.token));for(const [i,d] of docs.entries()){if(sha256Hex(d.file.data)!==m.files[i]?.sha256)throw new AppError("VALIDATION","Document changed");bytes+=d.file.data.length;if(!groupWithinBudget(input.members.length,input.members.reduce((n,x)=>n+x.files.length,0),bytes))throw new AppError("VALIDATION","Group limit");}
 inputs.push({actor,idempotencyKey:m.attempt,visaTypeId:input.visaTypeId,countryId:input.countryId,expectedFee:input.expectedFee,expectedCatalogue:input.expectedCatalogue,travellers:[{fullName:m.name,nationality:m.nationality,passportNumber:m.passport,passportExpiryDate:m.expiry,travellerProfileId:m.profileId}],documents:docs});}
 const results=await submitVisaGroup(actor,input.id,manifest,inputs);await Promise.allSettled(input.members.map(m=>clearRequestUploads(actor,m.attempt)));revalidatePath("/portal","layout");revalidatePath("/admin","layout");return reply({applications:results.map(r=>({applicationId:r.applicationId,reference:r.reference}))});
 }catch(e){const code=e instanceof AppError?e.code:e instanceof z.ZodError?"VALIDATION":"INTERNAL";return reply({code,error:requestErrorMessage(code,await getUiLocale())},code==="FORBIDDEN"?403:code==="INTERNAL"?500:400)}
}
