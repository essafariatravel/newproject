"use server";
import { setSessionCookie } from "@/lib/auth";
import { beginMfaEnrollment, completeMfa, requireMfaSession } from "@/lib/mfa";

export async function enrollMfaAction(password: string, authorizationCode:string) {
  try { await requireMfaSession(); return {enrollment:await beginMfaEnrollment(password,authorizationCode)}; }
  catch { return {error:"Verification failed. Please try again."}; }
}
export async function confirmMfaAction(code: string, enrollment: boolean) {
  try {
    await requireMfaSession();
    const result=await completeMfa(code,enrollment);
    await setSessionCookie(result.token,result.expiresAt);
    return {recoveryCodes:result.recoveryCodes};
  } catch { return {error:"Verification failed. Please try again."}; }
}
