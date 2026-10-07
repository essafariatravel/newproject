"use server";
import {eq} from "drizzle-orm";
import {z} from "zod";
import {visaTypes} from "@/db/schema";
import {runAction} from "@/lib/action-helpers";
import {requireStaff} from "@/lib/auth";
import {requirePermission} from "@/lib/rbac";
import {currentOperationActor} from "@/lib/operation-identity";
import {db} from "@/lib/db";
import {recordIdentityAudit} from "@/lib/account-security";
import {AppError} from "@/lib/types";

export async function saveRuleGovernanceAction(form:FormData){
  const id=z.string().uuid().parse(form.get("id"));
  await runAction(`/admin/config/visa-types/${id}`,async()=>{
    const actor=await requireStaff();requirePermission(actor,"config.manage");
    return db.transaction(async tx=>{
    const staff=await currentOperationActor(tx,actor);
    const state=z.enum(["UNVERIFIED","ACTIVE","STALE"]).parse(form.get("state"));
    const source=String(form.get("source")??"").trim();
    if(source){const url=new URL(z.string().url().max(2048).parse(source));if(url.protocol!=="https:"||url.username||url.password)throw new AppError("VALIDATION","Enter a public HTTPS official source.");}
    const date=(key:string)=>{const value=String(form.get(key)??"");if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new AppError("VALIDATION","Enter a valid date.");return value;};
    const from=date("effectiveFrom"),to=date("effectiveTo"),verified=date("verifiedDate");
    if(from&&to&&to<from)throw new AppError("VALIDATION","Effective dates are reversed.");
    if(verified&&verified>new Date().toISOString().slice(0,10))throw new AppError("VALIDATION","Verification cannot be in the future.");
    if(state==="ACTIVE"&&(!source||!verified||form.get("reviewed")!=="yes"))throw new AppError("VALIDATION","Active evidence requires an official source, verification date and confirmed review.");
    const nationalities=String(form.get("nationalities")??"").split(/[\s,]+/).filter(Boolean);
    if(nationalities.length>250||nationalities.some(code=>!/^[A-Z]{3}$/.test(code)))throw new AppError("VALIDATION","Use ISO nationality codes separated by commas.");
    const [existing]=await tx.select().from(visaTypes).where(eq(visaTypes.id,id)).for("update");
    if(!existing)throw new AppError("NOT_FOUND","Programme not found.");
    const evidence={state,officialSource:source||null,effectiveFrom:from,effectiveTo:to,verificationDate:verified,reviewerId:staff.id,reviewedAt:new Date().toISOString(),nationalityApplicability:[...new Set(nationalities)]};
    await tx.update(visaTypes).set({ruleGovernance:evidence,updatedAt:new Date()}).where(eq(visaTypes.id,id));
    await recordIdentityAudit(tx,{actor:staff,action:"VISA_RULE_EVIDENCE_RECORDED",entity:"visa_type",entityId:id,metadata:{previousVersion:existing.ruleVersion,evidence}});
    return "Rule provenance recorded. Historical dossiers retain their captured version.";
    });
  });
}
