import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import type { AuthUser } from "@/lib/types";
export interface InboxThread { applicationId:string;reference:string;traveller:string;destination:string;visa:string;agencyName:string;body:string;createdAt:Date;unread:boolean;needsReply:boolean;visibility:string }
export async function conversationInbox(actor:AuthUser,input:{q?:string;filter?:string;page?:number}={}):Promise<InboxThread[]>{
  requirePermission(actor,actor.agencyId ? "communications.post.agency" : "communications.view.all");
  const t=qualifiedTable;
  const result=await pool.query(`with visible as (
    select message.*, row_number() over (partition by message.application_id order by message.created_at desc,message.id desc) as position
    from ${t("communications")} message join ${t("applications")} dossier on dossier.id=message.application_id
    where ($1::uuid is null or (dossier.agency_id=$1 and message.visibility='AGENCY'))
  ), threads as (
    select dossier.id as "applicationId", dossier.reference, coalesce(traveller.full_name,concat_ws(' ',traveller.first_name,traveller.last_name),'') as traveller,
      dossier.country_name as destination,dossier.visa_type_name as visa,coalesce(agency.trading_name,agency.legal_name) as "agencyName",
      message.body,message.created_at as "createdAt",message.visibility,
      exists(select 1 from ${t("notifications")} event where event.user_id=$2 and event.application_id=dossier.id and event.type='MESSAGE_POSTED' and event.read_at is null) as unread,
      coalesce((select (($1::uuid is null and sender.agency_id is not null) or ($1::uuid is not null and sender.agency_id is null))
        from ${t("communications")} external join ${t("users")} sender on sender.id=external.author_id
        where external.application_id=dossier.id and external.visibility='AGENCY' order by external.created_at desc,external.id desc limit 1),false) as "needsReply"
    from visible message join ${t("applications")} dossier on dossier.id=message.application_id
    join ${t("agencies")} agency on agency.id=dossier.agency_id
    left join lateral (select * from ${t("applicants")} where application_id=dossier.id order by created_at limit 1) traveller on true
    where message.position=1
  ) select * from threads where ($3='' or concat_ws(' ',traveller,reference,"agencyName",destination,visa) ilike $3)
    and ($4='all' or ($4='unread' and unread) or ($4='reply' and "needsReply"))
    order by "createdAt" desc,"applicationId" limit 100 offset $5`,[actor.agencyId,actor.id,input.q?.trim()?`%${input.q.trim().slice(0,160)}%`:"",["unread","reply"].includes(input.filter??"")?input.filter:"all",(Math.max(1,Math.min(10000,input.page??1))-1)*100]);
  return result.rows;
}
