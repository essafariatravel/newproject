import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {hubEnabled,minimumExpiry,vaultEnabled} from "./traveller-hub-policy";
import {officialDocumentIntegritySql} from "./decision-integrity";
import {algeriaToday} from "./travel-deadline";
import type {AuthUser} from "./types";
/** Owner-only, one bounded scan per hour, atomic event+notification insertion. No external delivery. */
export async function refreshTravellerRenewals(user:AuthUser){
 if(!hubEnabled()||user.role!=="AGENCY_ADMIN"||!user.agencyId||user.mustChangePassword)return;
 const today=algeriaToday(),min=minimumExpiry(today);
 const visaCtes=vaultEnabled()?`, visa_due as (select r.id user_id,v.document_id,v.profile_id,v.agency_id,v.valid_until expiry,case when v.valid_until<$3::date then 'EXPIRED' else 'URGENT' end stage from scan join recipient r on r.id=scan.user_id join ${qt("traveller_visa_dates")} v on v.agency_id=r.agency_id join ${qt("traveller_profiles")} p on p.id=v.profile_id and p.agency_id=v.agency_id and p.archived_at is null join ${qt("documents")} d on d.id=v.document_id join ${qt("document_blobs")} b on b.key=d.storage_key join ${qt("document_types")} dt on dt.id=d.document_type_id and dt.code='DECISION_VISA_APPROVAL' join ${qt("applications")} a on a.id=d.application_id and a.agency_id=v.agency_id join ${qt("statuses")} s on s.id=a.status_id and s.code='APPROVED' where v.valid_until<=$3::date+30 and a.decision_at is not null and (select count(*) from ${qt("applicants")} t where t.application_id=a.id)=1 and exists(select 1 from ${qt("applicants")} t join ${qt("traveller_profile_links")} l on l.applicant_id=t.id and l.agency_id=v.agency_id and l.profile_id=v.profile_id where t.application_id=a.id) and ${officialDocumentIntegritySql("d","b")}), new_visa_events as (insert into ${qt("traveller_visa_renewal_events")}(user_id,document_id,expiry,stage) select d.user_id,d.document_id,d.expiry,d.stage from visa_due d where not exists(select 1 from ${qt("traveller_visa_renewal_events")} e where e.user_id=d.user_id and e.document_id=d.document_id and e.expiry=d.expiry and e.stage=d.stage) order by d.expiry,d.document_id limit 100 on conflict do nothing returning *)`:"";
 const visaNotifications=vaultEnabled()?` union all select e.notification_id,e.user_id,d.agency_id,'TRAVELLER_VISA_'||e.stage,'Traveller visa reminder',e.expiry::text,'/portal/applicants/'||d.profile_id::text from new_visa_events e join visa_due d on d.user_id=e.user_id and d.document_id=e.document_id and d.expiry=e.expiry and d.stage=e.stage`:"";
 await pool.query(`with recipient as (
 select u.id,u.agency_id from ${qt("users")} u join ${qt("agencies")} a on a.id=u.agency_id and a.status='ACTIVE'
 where u.id=$1::uuid and u.agency_id=$2::uuid and u.role='AGENCY_ADMIN' and u.status='ACTIVE' and not u.activation_pending and not u.must_change_password
 ), scan as (
 insert into ${qt("traveller_renewal_scan")} as existing(user_id,scanned_at) select id,now() from recipient
 on conflict(user_id) do update set scanned_at=excluded.scanned_at where existing.scanned_at<now()-interval '1 hour' returning user_id
 ), due as (
 select r.id user_id,p.agency_id,p.id profile_id,p.passport_expiry expiry,
 case when p.passport_expiry<=$3::date then 'EXPIRED' when p.passport_expiry<=$3::date+30 then 'URGENT' else 'RENEW' end stage
 from scan join recipient r on r.id=scan.user_id join ${qt("traveller_profiles")} p on p.agency_id=r.agency_id where p.passport_expiry<$4::date ${vaultEnabled()?"and p.archived_at is null":""}
 ), new_events as (
 insert into ${qt("traveller_renewal_events")}(user_id,agency_id,profile_id,expiry,stage)
 select d.user_id,d.agency_id,d.profile_id,d.expiry,d.stage from due d where not exists(select 1 from ${qt("traveller_renewal_events")} e where e.user_id=d.user_id and e.profile_id=d.profile_id and e.expiry=d.expiry and e.stage=d.stage) order by d.expiry,d.profile_id limit 100 on conflict do nothing returning *
 )${visaCtes}
 insert into ${qt("notifications")}(id,user_id,agency_id,type,title,body,link)
 select e.notification_id,e.user_id,e.agency_id,'TRAVELLER_PASSPORT_'||e.stage,'Traveller passport reminder',e.expiry::text,'/portal/applicants/'||e.profile_id::text from new_events e${visaNotifications}`,[user.id,user.agencyId,today,min]);
}
export async function safeTravellerRenewals(user:AuthUser){try{await refreshTravellerRenewals(user)}catch{console.warn("[traveller-hub] Renewal scan unavailable")}}
