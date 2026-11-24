import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable} from "@/lib/database-schema";
import {isAgencyRole,type AuthUser} from "@/lib/types";
export async function readCaseVfsReference(id:string,user:AuthUser):Promise<string|null>{
 if(process.env.VFS_CHINA_STAFF_BINDING_ENABLED!=="true"||!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword)return null;
 try{const result=await pool.query<{reference:string}>(`select v.vfs_reference as reference from ${qualifiedTable("vfs_china_bindings")} v join ${qualifiedTable("applications")} a on a.id=v.application_id join ${qualifiedTable("countries")} c on c.id=a.country_id where a.id=$1 and a.agency_id=$2 and c.iso2='CN' limit 1`,[id,user.agencyId]);return result.rows[0]?.reference??null}catch{return null}
}
