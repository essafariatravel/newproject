import {hasPermission} from "@/lib/rbac";
import {isAgencyRole,type AuthUser} from "@/lib/types";
import {groupEnabled} from "./group-policy";
/** Group access is agency-owned, not the Staff global application permission.
 * All reads and writes must separately scope by the verified actor's agencyId. */
export function canAccessGroups(user:AuthUser,env:Record<string,string|undefined>=process.env):user is AuthUser&{agencyId:string}{
 return groupEnabled(env)&&Boolean(user.agencyId)&&isAgencyRole(user.role)&&user.userStatus==="ACTIVE"&&user.agencyStatus==="ACTIVE"&&!user.mustChangePassword&&!user.mfaPending&&hasPermission(user,"applications.create")&&hasPermission(user,"documents.upload.own")&&hasPermission(user,"applicants.view.all");
}
