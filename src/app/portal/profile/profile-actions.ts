"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAgencyUser } from "@/lib/auth";
import { runAction } from "@/lib/action-helpers";
import { AGENCY_PREF_COOKIE,cleanPrefs } from "@/lib/agency-preference-values";
import { activeVisaOptions } from "@/lib/queries";
import { revokeOtherAgencySessions } from "@/lib/agency-profile-security";
export async function saveAgencyPrefs(form:FormData):Promise<void>{
 await runAction("/portal/profile?tab=preferences",async()=>{
  const user=await requireAgencyUser();
  const prefs=cleanPrefs({nationality:form.get("nationality"),sort:form.get("sort"),density:form.get("density"),favorites:form.getAll("favorites")});
  if(prefs.favorites.length){const valid=new Set((await activeVisaOptions()).map(v=>v.countryId));prefs.favorites=prefs.favorites.filter(id=>valid.has(id))}
  (await cookies()).set(AGENCY_PREF_COOKIE,JSON.stringify({...prefs,scope:user.id}),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/portal",maxAge:31536000});
  return "Workspace preferences saved.";
 });
}
export async function revokeOwnOtherSessions(form:FormData):Promise<void>{
 await runAction("/portal/profile?tab=account",async()=>{
  const actor=await requireAgencyUser();
  await revokeOtherAgencySessions(actor,form.get("session"));
  revalidatePath("/portal/profile");
  return "Other sessions disconnected.";
 });
}
