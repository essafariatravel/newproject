"use server";
import {and,eq,isNull} from "drizzle-orm";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {notifications} from "@/db/schema";
import {db} from "@/lib/db";
import {requireUser} from "@/lib/auth";
import {isAgencyRole} from "@/lib/types";
export async function markAgencyNotificationsRead(id:string|null):Promise<boolean>{
 try{
  const user=await requireUser();
  if(!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword)return false;
  const conditions=[eq(notifications.userId,user.id),isNull(notifications.readAt)];
  if(id!==null)conditions.push(eq(notifications.id,z.string().uuid().parse(id)));
  await db.update(notifications).set({readAt:new Date()}).where(and(...conditions));
  revalidatePath("/portal","layout");
  return true;
 }catch{return false}
}
