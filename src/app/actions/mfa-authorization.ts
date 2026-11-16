"use server";
import {requireStaff} from "@/lib/auth";
import {authorizeMfaEnrollment} from "@/lib/mfa";
import {z} from "zod";
export async function authorizeMfaEnrollmentAction(userId:string){
  try{
    const actor=await requireStaff();
    return {code:await authorizeMfaEnrollment(actor,z.string().uuid().parse(userId))};
  }catch{return {error:true};}
}
