import {sql} from "drizzle-orm";
import {qualifiedTable} from "./database-schema";
/** Latest version only; open replacement requests invalidate completion. */
export function usableCurrentCaseDocument(itemId:ReturnType<typeof sql>,applicationId:ReturnType<typeof sql>,typeId:ReturnType<typeof sql>){
 return sql`coalesce((select d.status in ('UPLOADED','UNDER_REVIEW','ACCEPTED') from ${sql.raw(qualifiedTable("documents"))} d
 where d.checklist_item_id=${itemId} and d.application_id=${applicationId}
 order by d.version desc,d.created_at desc,d.id desc limit 1),false)
 and not exists(select 1 from ${sql.raw(qualifiedTable("document_requests"))} r where r.application_id=${applicationId} and r.status='OPEN'
 and (r.checklist_item_id=${itemId} or (r.checklist_item_id is null and r.document_type_id=${typeId})))`;
}
