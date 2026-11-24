"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action-helpers";
import { requireAgencyUser, requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/types";
import { requestApplicationCancellation, decideApplicationCancellation } from "@/lib/application-cancellations";

const uuid=z.string().uuid();
function refresh(id:string){
 for(const path of ["/admin","/admin/applications","/admin/billing","/admin/notifications","/portal","/portal/applications","/portal/wallet","/portal/notifications","/admin/applications/"+id,"/portal/applications/"+id]) revalidatePath(path);
}
export async function requestCancellationAction(formData:FormData):Promise<void>{
 const id=uuid.parse(formData.get("applicationId"));
 await runAction("/portal/applications/"+id,async()=>{
  const actor=await requireAgencyUser();
  await requestApplicationCancellation({applicationId:id,actor,reason:String(formData.get("reason")??"")});
  refresh(id);
  return "Cancellation request sent.";
 });
}
export async function decideCancellationAction(formData:FormData):Promise<void>{
 const id=uuid.parse(formData.get("applicationId"));
 await runAction("/admin/applications/"+id,async()=>{
  const actor=await requireStaff();
  if(formData.get("confirm")!=="on")throw new AppError("VALIDATION","Confirm this cancellation decision.");
  const decision=z.enum(["APPROVED","REFUSED"]).parse(formData.get("decision"));
  const requestId=formData.get("requestId")?uuid.parse(formData.get("requestId")):null;
  await decideApplicationCancellation({applicationId:id,actor,requestId,decision,reason:String(formData.get("reason")??""),refundAmount:String(formData.get("refundAmount")??"")});
  refresh(id);
  return decision==="APPROVED"?"Application cancelled and refund recorded.":"Cancellation request refused.";
 });
}
