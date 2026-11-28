import {and,desc,gte,inArray,isNull,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {auditLogs} from "@/db/schema";
import {requireAgencyUser} from "@/lib/auth";
import {activeVisaOptions} from "@/lib/queries";
import {projectCatalogueChanges} from "./catalogue-change-model";
/** Strictly private projection: authenticate here even if caller is a server page.
 * Current bookable IDs are obtained server-side; never pass audit metadata to UI.
 */
export async function readCatalogueChanges(){
 await requireAgencyUser();
 const programmes=await activeVisaOptions();
 const ids=programmes.map(p=>p.id);
 if(!ids.length)return {programmes,changes:[]};
 const programmeId=sql<string>`case when ${auditLogs.entity}='visa_type' then ${auditLogs.entityId} else ${auditLogs.metadata}->>'visaTypeId' end`;
 const rows=await db.select({id:auditLogs.id,programmeId,action:auditLogs.action,createdAt:auditLogs.createdAt,metadata:auditLogs.metadata})
 .from(auditLogs).where(and(isNull(auditLogs.agencyId),gte(auditLogs.createdAt,new Date(Date.now()-30*86400000)),inArray(auditLogs.action,["CONFIG_VISA_TYPE_UPDATED","CONFIG_VISA_TYPE_TOGGLED","CONFIG_REQUIREMENT_ADDED","CONFIG_REQUIREMENT_TOGGLED","CONFIG_REQUIREMENT_REMOVED"]),inArray(programmeId,ids)))
 .orderBy(desc(auditLogs.createdAt),desc(auditLogs.id)).limit(100);
 return {programmes,changes:projectCatalogueChanges(rows,new Set(ids))};
}
