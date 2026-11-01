import { and, eq, ne, sql } from 'drizzle-orm';
import { siteSettings } from '@/db/schema';
import type { IdentityTransaction } from '@/lib/account-security';
import { AppError, type StaffPermissions } from '@/lib/types';

/** Private application metadata, never public CMS settings or a login identity. */
export const STAFF_PROFILE_PREFIX='internal.staff.';
export interface StaffProfile { username:string|null; staffPermissions:StaffPermissions|null }
export function resolveStaffProfile(value:unknown):StaffProfile {
 if(value==null)return {username:null,staffPermissions:null};
 if(typeof value!=='object'||Array.isArray(value))return {username:null,staffPermissions:{catalogManage:false,staffManage:false}};
 const profile=value as Record<string,unknown>,permissions=profile.staffPermissions as Record<string,unknown>|null|undefined;
 return {username:typeof profile.username==='string'?profile.username:null,
  staffPermissions:permissions==null?null:{catalogManage:permissions.catalogManage===true,staffManage:permissions.staffManage===true}};
}
export async function readStaffProfile(reader:Pick<IdentityTransaction,'select'>,userId:string):Promise<StaffProfile>{
 const [row]=await reader.select({value:siteSettings.value}).from(siteSettings).where(eq(siteSettings.key,STAFF_PROFILE_PREFIX+userId)).limit(1);
 return resolveStaffProfile(row?.value);
}
/** Call only inside the identity-locked, manager-authorized account transaction. */
export async function saveStaffProfile(tx:IdentityTransaction,userId:string,profile:StaffProfile,actorId:string){
 if(profile.username){const [duplicate]=await tx.select({key:siteSettings.key}).from(siteSettings).where(and(
  sql`${siteSettings.key} like ${STAFF_PROFILE_PREFIX+'%'}`,ne(siteSettings.key,STAFF_PROFILE_PREFIX+userId),
  sql`lower(btrim(${siteSettings.value}->>'username'))=lower(btrim(${profile.username}))`)).limit(1);
  if(duplicate)throw new AppError('DUPLICATE','This internal username is already in use.');}
 await tx.insert(siteSettings).values({key:STAFF_PROFILE_PREFIX+userId,value:profile,updatedBy:actorId})
  .onConflictDoUpdate({target:siteSettings.key,set:{value:profile,updatedBy:actorId,updatedAt:new Date()}});
}
