import {createHash} from "node:crypto";
import type {AuthUser} from "@/lib/types";
/** Non-secret namespace, never a credential. The API independently authenticates every request. */
export function agencyNotificationScope(user:AuthUser,locale:"fr"|"en"|"ar",financial:boolean):string|null{
 if(!user.agencyId||!user.sessionId||user.credentialVersion===undefined||user.mustChangePassword)return null;
 return createHash("sha256").update(JSON.stringify(["essafaria-notifications-v1",user.id,user.agencyId,user.sessionId,user.credentialVersion,user.role,locale,financial])).digest("hex");
}
